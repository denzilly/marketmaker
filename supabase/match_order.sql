-- Server-side order matching function
-- Prevents race conditions with FOR UPDATE row locking
-- Wraps all operations in a single transaction for atomicity
--
-- Run this in Supabase SQL Editor after deploying schema.sql

CREATE OR REPLACE FUNCTION match_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_incoming orders%ROWTYPE;
  v_resting RECORD;
  v_fill_size INTEGER;
  v_trade_price DECIMAL;
  v_remaining INTEGER;
  v_last_price DECIMAL;
  v_trade_id UUID;
  v_trade_ids UUID[] := '{}';
  v_updated_order_ids UUID[] := '{}';
  v_buy_order_id UUID;
  v_sell_order_id UUID;
  v_buyer_id UUID;
  v_seller_id UUID;
BEGIN
  -- Get and lock the incoming order
  SELECT * INTO v_incoming FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND OR v_incoming.status != 'open' OR v_incoming.remaining_size <= 0 THEN
    RETURN jsonb_build_object(
      'trades', '[]'::JSONB,
      'updated_orders', '[]'::JSONB,
      'remaining_size', COALESCE(v_incoming.remaining_size, 0)
    );
  END IF;

  v_remaining := v_incoming.remaining_size;

  -- Find and lock matching resting orders (price-time priority)
  FOR v_resting IN
    SELECT * FROM orders
    WHERE asset_id = v_incoming.asset_id
      AND status = 'open'
      AND remaining_size > 0
      AND participant_id != v_incoming.participant_id
      AND id != v_incoming.id
      AND (
        (v_incoming.side = 'buy' AND side = 'sell' AND price <= v_incoming.price)
        OR (v_incoming.side = 'sell' AND side = 'buy' AND price >= v_incoming.price)
      )
    ORDER BY
      CASE WHEN v_incoming.side = 'buy' THEN price END ASC,
      CASE WHEN v_incoming.side = 'sell' THEN price END DESC,
      created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_fill_size := LEAST(v_remaining, v_resting.remaining_size);
    v_trade_price := v_resting.price;
    v_last_price := v_trade_price;

    -- Determine buyer/seller
    IF v_incoming.side = 'buy' THEN
      v_buy_order_id := v_incoming.id;
      v_sell_order_id := v_resting.id;
      v_buyer_id := v_incoming.participant_id;
      v_seller_id := v_resting.participant_id;
    ELSE
      v_buy_order_id := v_resting.id;
      v_sell_order_id := v_incoming.id;
      v_buyer_id := v_resting.participant_id;
      v_seller_id := v_incoming.participant_id;
    END IF;

    -- Insert trade
    INSERT INTO trades (asset_id, buy_order_id, sell_order_id, buyer_id, seller_id, price, size)
    VALUES (v_incoming.asset_id, v_buy_order_id, v_sell_order_id, v_buyer_id, v_seller_id, v_trade_price, v_fill_size)
    RETURNING id INTO v_trade_id;

    v_trade_ids := array_append(v_trade_ids, v_trade_id);

    -- Update resting order
    UPDATE orders SET
      remaining_size = remaining_size - v_fill_size,
      status = CASE WHEN remaining_size - v_fill_size = 0 THEN 'filled' ELSE status END
    WHERE id = v_resting.id;

    v_updated_order_ids := array_append(v_updated_order_ids, v_resting.id);
    v_remaining := v_remaining - v_fill_size;
  END LOOP;

  -- Update incoming order if any fills occurred
  IF v_remaining != v_incoming.remaining_size THEN
    UPDATE orders SET
      remaining_size = v_remaining,
      status = CASE WHEN v_remaining = 0 THEN 'filled' ELSE status END
    WHERE id = v_incoming.id;

    v_updated_order_ids := array_append(v_updated_order_ids, v_incoming.id);

    -- Update last_price on asset
    UPDATE assets SET last_price = v_last_price WHERE id = v_incoming.asset_id;
  END IF;

  -- Return results by querying the actual rows (ensures correct types)
  RETURN jsonb_build_object(
    'trades', COALESCE(
      (SELECT jsonb_agg(to_jsonb(t)) FROM trades t WHERE t.id = ANY(v_trade_ids)),
      '[]'::JSONB
    ),
    'updated_orders', COALESCE(
      (SELECT jsonb_agg(to_jsonb(o)) FROM orders o WHERE o.id = ANY(v_updated_order_ids)),
      '[]'::JSONB
    ),
    'remaining_size', v_remaining
  );
END;
$$;

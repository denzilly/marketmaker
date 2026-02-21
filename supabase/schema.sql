-- MarketMaker Database Schema
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/YOUR_PROJECT/sql

-- ============================================
-- TABLES
-- ============================================

-- Markets (sessions that users create/join)
CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT 'Untitled Market',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID -- references participants, set after first participant created
);

-- Participants (users in a market)
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
    is_admin BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add foreign key from markets to participants (for created_by)
ALTER TABLE markets
ADD CONSTRAINT markets_created_by_fkey
FOREIGN KEY (created_by) REFERENCES participants(id);

-- Assets (things to trade, e.g. "Bill's Math Test")
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID NOT NULL REFERENCES participants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'trading' CHECK (status IN ('trading', 'settled')),
    settlement_value DECIMAL,
    settled_at TIMESTAMPTZ,
    last_price DECIMAL
);

-- Orders (bids and offers in the order book)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id),
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    price DECIMAL NOT NULL,
    size INTEGER NOT NULL CHECK (size > 0),
    remaining_size INTEGER NOT NULL CHECK (remaining_size >= 0),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trades (executed transactions)
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    buy_order_id UUID NOT NULL REFERENCES orders(id),
    sell_order_id UUID NOT NULL REFERENCES orders(id),
    buyer_id UUID NOT NULL REFERENCES participants(id),
    seller_id UUID NOT NULL REFERENCES participants(id),
    price DECIMAL NOT NULL,
    size INTEGER NOT NULL CHECK (size > 0),
    executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Chat messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_participants_market ON participants(market_id);
CREATE INDEX idx_participants_token ON participants(token);
CREATE INDEX idx_assets_market ON assets(market_id);
CREATE INDEX idx_orders_asset ON orders(asset_id);
CREATE INDEX idx_orders_status ON orders(status) WHERE status = 'open';
CREATE INDEX idx_trades_asset ON trades(asset_id);
CREATE INDEX idx_trades_executed ON trades(executed_at DESC);
CREATE INDEX idx_messages_market ON messages(market_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- ============================================
-- VIEWS
-- ============================================

-- Positions view: calculates net position and P&L per participant per asset
-- Shows positions with non-zero net_position OR non-zero cash_flow (for closed positions with realized P&L)
CREATE VIEW positions AS
SELECT
    p.id as participant_id,
    a.id as asset_id,
    a.name as asset_name,
    a.last_price,
    a.status as asset_status,
    a.settlement_value,
    COALESCE(SUM(
        CASE
            WHEN t.buyer_id = p.id THEN t.size
            WHEN t.seller_id = p.id THEN -t.size
            ELSE 0
        END
    ), 0) as net_position,
    COALESCE(SUM(
        CASE
            WHEN t.buyer_id = p.id THEN -t.price * t.size
            WHEN t.seller_id = p.id THEN t.price * t.size
            ELSE 0
        END
    ), 0) as cash_flow
FROM participants p
CROSS JOIN assets a
LEFT JOIN trades t ON t.asset_id = a.id AND (t.buyer_id = p.id OR t.seller_id = p.id)
WHERE a.market_id = p.market_id
GROUP BY p.id, a.id, a.name, a.last_price, a.status, a.settlement_value
HAVING COALESCE(SUM(
    CASE
        WHEN t.buyer_id = p.id THEN t.size
        WHEN t.seller_id = p.id THEN -t.size
        ELSE 0
    END
), 0) != 0
OR COALESCE(SUM(
    CASE
        WHEN t.buyer_id = p.id THEN -t.price * t.size
        WHEN t.seller_id = p.id THEN t.price * t.size
        ELSE 0
    END
), 0) != 0;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (we'll validate via participant token in the app)
-- In production, you'd want more restrictive policies

CREATE POLICY "Allow all market operations" ON markets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all participant operations" ON participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all asset operations" ON assets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all order operations" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all trade operations" ON trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all message operations" ON messages FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- REALTIME
-- ============================================

-- Enable realtime for tables that need live updates
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE assets;
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Server-side order matching with row locking for atomicity.
-- Prevents race conditions when multiple users trade simultaneously.
-- See supabase/match_order.sql for the full annotated version.
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
  SELECT * INTO v_incoming FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND OR v_incoming.status != 'open' OR v_incoming.remaining_size <= 0 THEN
    RETURN jsonb_build_object(
      'trades', '[]'::JSONB,
      'updated_orders', '[]'::JSONB,
      'remaining_size', COALESCE(v_incoming.remaining_size, 0)
    );
  END IF;

  v_remaining := v_incoming.remaining_size;

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

    INSERT INTO trades (asset_id, buy_order_id, sell_order_id, buyer_id, seller_id, price, size)
    VALUES (v_incoming.asset_id, v_buy_order_id, v_sell_order_id, v_buyer_id, v_seller_id, v_trade_price, v_fill_size)
    RETURNING id INTO v_trade_id;

    v_trade_ids := array_append(v_trade_ids, v_trade_id);

    UPDATE orders SET
      remaining_size = remaining_size - v_fill_size,
      status = CASE WHEN remaining_size - v_fill_size = 0 THEN 'filled' ELSE status END
    WHERE id = v_resting.id;

    v_updated_order_ids := array_append(v_updated_order_ids, v_resting.id);
    v_remaining := v_remaining - v_fill_size;
  END LOOP;

  IF v_remaining != v_incoming.remaining_size THEN
    UPDATE orders SET
      remaining_size = v_remaining,
      status = CASE WHEN v_remaining = 0 THEN 'filled' ELSE status END
    WHERE id = v_incoming.id;

    v_updated_order_ids := array_append(v_updated_order_ids, v_incoming.id);

    UPDATE assets SET last_price = v_last_price WHERE id = v_incoming.asset_id;
  END IF;

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

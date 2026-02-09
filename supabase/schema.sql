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

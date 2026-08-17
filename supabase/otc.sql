-- OTC trading: bilateral proposals negotiated off the central order book.
-- Run this in the Supabase SQL Editor against an existing MarketMaker database.
-- (These statements are also folded into schema.sql for fresh installs.)

-- ============================================
-- TABLE
-- ============================================

-- OTC proposals: one participant proposes a trade directly to another.
-- `side` is from the PROPOSER's perspective: 'buy' means the proposer bids
-- (wants to buy from the counterparty), 'sell' means the proposer offers.
CREATE TABLE otc_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    proposer_id UUID NOT NULL REFERENCES participants(id),
    counterparty_id UUID NOT NULL REFERENCES participants(id),
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    price DECIMAL NOT NULL,
    size INTEGER NOT NULL CHECK (size > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    -- Set when accepted, so both sides can link the proposal to the printed trade.
    trade_id UUID REFERENCES trades(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Bumped on amend; the UI shows an "amended" tag when it differs from created_at.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT otc_proposals_distinct_parties CHECK (proposer_id != counterparty_id)
);

-- Trades printed from an accepted OTC proposal are flagged so the blotter and
-- activity log can tag them. Null/false on every pre-existing trade.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS is_otc BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_otc_proposals_market ON otc_proposals(market_id);
CREATE INDEX idx_otc_proposals_counterparty ON otc_proposals(counterparty_id) WHERE status = 'pending';
CREATE INDEX idx_otc_proposals_proposer ON otc_proposals(proposer_id) WHERE status = 'pending';
CREATE INDEX idx_otc_proposals_created ON otc_proposals(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE otc_proposals ENABLE ROW LEVEL SECURITY;

-- Same open policy as the rest of the app: access control is via unguessable
-- participant tokens at the application layer.
CREATE POLICY "Allow all otc proposal operations" ON otc_proposals FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE otc_proposals;

-- ============================================
-- POSITIONS VIEW: mark price fallback
-- ============================================

-- An asset that has only ever traded OTC has no `last_price` (OTC prints are
-- negotiated privately and deliberately don't move it), which left open
-- positions in it with no mark and therefore no unrealized P&L at all. Add a
-- `mark_price` column that falls back to the most recent trade of any kind.
-- `last_price` keeps its meaning (last book trade) for the order book.
CREATE OR REPLACE VIEW positions AS
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
    ), 0) as cash_flow,
    -- Price to mark open positions against. Normally the last book trade, but
    -- assets that have only ever traded OTC have no last_price (OTC prints are
    -- negotiated privately and don't move it), so fall back to the most recent
    -- trade of any kind rather than showing no P&L at all. Appended last so the
    -- view can be updated in place with CREATE OR REPLACE.
    COALESCE(
        a.last_price,
        (SELECT t2.price FROM trades t2 WHERE t2.asset_id = a.id ORDER BY t2.executed_at DESC LIMIT 1)
    ) as mark_price
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

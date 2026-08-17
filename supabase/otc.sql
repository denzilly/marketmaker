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

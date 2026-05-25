-- ============================================================================
-- CREATE PORTFOLIO_SHARES TABLE FOR PINIT VAULT PORTFOLIO SHARING
-- Run this in the Supabase SQL editor to enable cloud portfolio share tokens.
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolio_shares (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id           TEXT NOT NULL UNIQUE,           -- 'portfolio_{timestamp}_{rand6}'
    user_id            TEXT NOT NULL,                  -- portfolio owner's userId
    portfolio_id       TEXT NOT NULL,                  -- the portfolio being shared
    portfolio_snapshot JSONB NOT NULL DEFAULT '{}',    -- full portfolio snapshot at share time
    share_settings     JSONB NOT NULL DEFAULT '{}',    -- ExtendedShareSettings as JSONB
    share_link         TEXT NOT NULL DEFAULT '',        -- full public URL
    owner_name         TEXT NOT NULL DEFAULT '',
    expiry_date        TIMESTAMPTZ,                    -- null = never expires
    view_limit         INTEGER,                        -- null = unlimited
    views_used         INTEGER NOT NULL DEFAULT 0,
    is_active          BOOLEAN NOT NULL DEFAULT true,
    is_revoked         BOOLEAN NOT NULL DEFAULT false,
    device_fingerprint TEXT DEFAULT '',                -- owner device fingerprint at creation
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    accessed_at        TIMESTAMPTZ                     -- last viewer access
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_portfolio_shares_user_id      ON portfolio_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_shares_share_id     ON portfolio_shares(share_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_shares_portfolio_id ON portfolio_shares(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_shares_created_at   ON portfolio_shares(created_at DESC);

-- Enable Row-Level Security
ALTER TABLE portfolio_shares ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ────────────────────────────────────────────────────────────

-- Anyone (including unauthenticated share-link viewers) can read share records.
-- The app enforces expiry, revocation, and view-limit checks on the client.
CREATE POLICY "anyone_can_read_portfolio_shares"
ON portfolio_shares
FOR SELECT
USING (true);

-- Only the authenticated owner can create shares.
CREATE POLICY "owners_can_insert_portfolio_shares"
ON portfolio_shares
FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

-- Only the owner can update (revoke / restore / re-activate).
CREATE POLICY "owners_can_update_portfolio_shares"
ON portfolio_shares
FOR UPDATE
USING (auth.uid()::text = user_id);

-- Only the owner can permanently delete a share record.
CREATE POLICY "owners_can_delete_portfolio_shares"
ON portfolio_shares
FOR DELETE
USING (auth.uid()::text = user_id);

-- ─── SECURITY DEFINER function for view-count increment ──────────────────────
-- Share-link viewers are unauthenticated so they cannot UPDATE directly.
-- This function runs as the DB owner and is called via supabase.rpc().
CREATE OR REPLACE FUNCTION increment_portfolio_share_views(p_share_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE portfolio_shares
    SET    views_used  = views_used + 1,
           accessed_at = NOW()
    WHERE  share_id   = p_share_id
      AND  is_active  = true
      AND  is_revoked = false;
END;
$$;

-- ============================================================================
COMMENT ON TABLE portfolio_shares IS
  'Portfolio share tokens for PINIT Vault.
   SELECT is open (public share-link viewers need it, unauthenticated).
   INSERT/UPDATE/DELETE are restricted to the portfolio owner.
   View-count increments go through increment_portfolio_share_views() RPC
   (SECURITY DEFINER) so unauthenticated viewers can trigger them safely.';

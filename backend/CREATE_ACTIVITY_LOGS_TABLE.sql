-- ============================================================================
-- CREATE ACTIVITY_LOGS TABLE FOR PINIT VAULT SECURITY MONITORING
-- Run this in the Supabase SQL editor to enable cloud activity tracking.
-- Without this table, events are stored in localStorage only (same-device).
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        TEXT NOT NULL UNIQUE,        -- Client-generated event ID
    user_id         TEXT NOT NULL,               -- Document owner's user ID
    share_id        TEXT,                        -- Share token (nullable for vault events)
    event_type      TEXT NOT NULL,               -- 'link_accessed', 'downloaded', etc.
    file_name       TEXT NOT NULL DEFAULT '',    -- Name of the file involved
    file_type       TEXT NOT NULL DEFAULT 'unknown', -- 'pdf', 'image', 'document', 'unknown'
    ip_address      TEXT DEFAULT 'Unknown',
    geo_country     TEXT DEFAULT 'Unknown',
    geo_city        TEXT DEFAULT 'Unknown',
    device_type     TEXT DEFAULT 'unknown',      -- 'mobile', 'desktop', 'tablet'
    device_info     TEXT DEFAULT '',             -- Truncated user-agent
    risk_score      INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'success',      -- 'success', 'blocked', 'denied', 'warning'
    security_events TEXT[] DEFAULT '{}',         -- Array of security event types
    recipient_email TEXT,
    recipient_name  TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_share_id   ON activity_logs(share_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type ON activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_risk_score ON activity_logs(risk_score DESC);

-- Enable Row-Level Security
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ────────────────────────────────────────────────────────────

-- Anyone (including unauthenticated visitors of share links) can INSERT events.
-- This is intentional: the share link viewer logs the event on behalf of the owner.
CREATE POLICY "anyone_can_log_events"
ON activity_logs
FOR INSERT
WITH CHECK (true);

-- Only the document owner can read their own events.
CREATE POLICY "owners_can_read_own_events"
ON activity_logs
FOR SELECT
USING (auth.uid()::text = user_id);

-- Owners can delete their own events.
CREATE POLICY "owners_can_delete_own_events"
ON activity_logs
FOR DELETE
USING (auth.uid()::text = user_id);

-- ============================================================================
COMMENT ON TABLE activity_logs IS
  'Security and activity events logged by PINIT Vault share viewers.
   INSERT is open to all (share viewers are unauthenticated).
   SELECT/DELETE is restricted to the document owner.';

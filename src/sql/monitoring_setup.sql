-- ============================================================
-- PINIT DNA Monitoring Tables  — run ONCE in Supabase SQL Editor
-- ============================================================

-- 1. Viewers who opened a share link
CREATE TABLE IF NOT EXISTS share_visitors (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id          text NOT NULL,
  visitor_id        text NOT NULL,
  visitor_name      text NOT NULL,
  visitor_phone     text,
  ip_address        text,
  geo_city          text,
  geo_area          text,
  geo_district      text,
  geo_state         text,
  geo_country       text,
  geo_country_code  text,
  geo_pincode       text,
  geo_formatted     text,
  gps_lat           double precision,
  gps_lng           double precision,
  device_type       text,
  os                text,
  browser           text,
  screen_resolution text,
  language          text,
  timezone          text,
  network_type      text,
  network_speed     text,
  session_start     timestamptz NOT NULL DEFAULT now(),
  last_active       timestamptz,
  parent_visitor_id text,
  parent_share_id   text,
  created_at        timestamptz DEFAULT now(),
  UNIQUE(share_id, visitor_id)
);

-- 2. Security events (screenshots, copies, print, devtools, etc.)
CREATE TABLE IF NOT EXISTS share_security_events (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id     text NOT NULL,
  visitor_id   text,
  visitor_name text,
  event_type   text NOT NULL,
  details      text,
  risk_score   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);

-- 3. Download permission requests
CREATE TABLE IF NOT EXISTS download_requests (
  id             text PRIMARY KEY,
  share_id       text NOT NULL,
  visitor_id     text,
  visitor_name   text,
  status         text DEFAULT 'pending',
  approved_limit integer DEFAULT 0,
  downloads_used integer DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

-- 4. Revoked viewers
CREATE TABLE IF NOT EXISTS share_revoked_visitors (
  share_id   text NOT NULL,
  visitor_id text NOT NULL,
  revoked_at timestamptz DEFAULT now(),
  PRIMARY KEY (share_id, visitor_id)
);

-- Enable RLS
ALTER TABLE share_visitors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_security_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE download_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_revoked_visitors  ENABLE ROW LEVEL SECURITY;

-- Allow full public access (viewers don't log in)
DO $$ BEGIN
  CREATE POLICY "pinit_public_all" ON share_visitors         FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "pinit_public_all" ON share_security_events  FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "pinit_public_all" ON download_requests      FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "pinit_public_all" ON share_revoked_visitors FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

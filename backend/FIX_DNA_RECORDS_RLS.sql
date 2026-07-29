-- FIX: Enable INSERT/UPDATE on dna_records so ownership scans work cross-device.
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Root cause: Without these policies, pushToSupabase() silently fails on every
-- DNA generation, meaning scans from other devices/sessions find no records and
-- always show Trust Score 0 / "No ownership data found".

-- Create table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS dna_records (
  id             BIGSERIAL PRIMARY KEY,
  dna_id         TEXT NOT NULL UNIQUE,
  signature      TEXT,
  user_id        TEXT,
  file_name      TEXT,
  file_type      TEXT,
  size_bytes     BIGINT,
  sha256         TEXT,
  p_hash         TEXT,
  a_hash         TEXT,
  d_hash         TEXT,
  edge_signature TEXT,
  hmac_seal      TEXT,
  ownership      JSONB,
  device_network JSONB,
  custody        JSONB DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_dna_records_dna_id  ON dna_records(dna_id);
CREATE INDEX IF NOT EXISTS idx_dna_records_sha256  ON dna_records(sha256);
CREATE INDEX IF NOT EXISTS idx_dna_records_p_hash  ON dna_records(p_hash);
CREATE INDEX IF NOT EXISTS idx_dna_records_user_id ON dna_records(user_id);

-- Enable Row Level Security
ALTER TABLE dna_records ENABLE ROW LEVEL SECURITY;

-- Drop any old restrictive policies that block inserts
DROP POLICY IF EXISTS "Users can see their own records"    ON dna_records;
DROP POLICY IF EXISTS "Users can insert their own records" ON dna_records;
DROP POLICY IF EXISTS "Users can update their own records" ON dna_records;
DROP POLICY IF EXISTS "Anyone can read dna records"        ON dna_records;
DROP POLICY IF EXISTS "Authenticated can insert dna records" ON dna_records;
DROP POLICY IF EXISTS "Authenticated can update dna records" ON dna_records;

-- READ: any user (anon or authenticated) can read all records.
-- Required for cross-device and cross-account ownership verification.
CREATE POLICY "Anyone can read dna records"
  ON dna_records FOR SELECT USING (true);

-- INSERT: anyone can insert (app uses custom user_id, not Supabase auth).
CREATE POLICY "Anyone can insert dna records"
  ON dna_records FOR INSERT WITH CHECK (true);

-- UPDATE: anyone can update (custody chain appends, record enrichment).
CREATE POLICY "Anyone can update dna records"
  ON dna_records FOR UPDATE USING (true) WITH CHECK (true);

-- Grant table access to anon and authenticated roles
GRANT SELECT, INSERT, UPDATE ON dna_records TO anon;
GRANT SELECT, INSERT, UPDATE ON dna_records TO authenticated;
GRANT ALL                     ON dna_records TO service_role;

-- DNA Records table — stores ownership fingerprints for all PINIT-encrypted assets.
-- Any authenticated user must be able to READ records (for cross-account scan detection).
-- Only the owner can INSERT/UPDATE their own records.

CREATE TABLE IF NOT EXISTS dna_records (
  id           BIGSERIAL PRIMARY KEY,
  dna_id       TEXT NOT NULL UNIQUE,
  signature    TEXT,
  user_id      TEXT,
  file_name    TEXT,
  file_type    TEXT,
  size_bytes   BIGINT,
  sha256       TEXT,
  p_hash       TEXT,
  a_hash       TEXT,
  d_hash       TEXT,
  edge_signature TEXT,
  hmac_seal    TEXT,
  ownership    JSONB,
  device_network JSONB,
  custody      JSONB DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dna_records_dna_id   ON dna_records(dna_id);
CREATE INDEX IF NOT EXISTS idx_dna_records_sha256   ON dna_records(sha256);
CREATE INDEX IF NOT EXISTS idx_dna_records_p_hash   ON dna_records(p_hash);
CREATE INDEX IF NOT EXISTS idx_dna_records_user_id  ON dna_records(user_id);

-- Enable RLS
ALTER TABLE dna_records ENABLE ROW LEVEL SECURITY;

-- DROP old restrictive policies if they exist
DROP POLICY IF EXISTS "Users can see their own records" ON dna_records;
DROP POLICY IF EXISTS "Users can insert their own records" ON dna_records;
DROP POLICY IF EXISTS "Users can update their own records" ON dna_records;

-- ALLOW: any authenticated user can READ any DNA record.
-- This is required for cross-account ownership verification (scan on another device).
CREATE POLICY "Anyone can read dna records" ON dna_records
  FOR SELECT USING (true);

-- ALLOW: authenticated users can insert records (for their own assets)
CREATE POLICY "Authenticated can insert dna records" ON dna_records
  FOR INSERT WITH CHECK (true);

-- ALLOW: authenticated users can update records (for custody chain updates)
CREATE POLICY "Authenticated can update dna records" ON dna_records
  FOR UPDATE USING (true) WITH CHECK (true);

-- Grant access
GRANT SELECT, INSERT, UPDATE ON dna_records TO anon;
GRANT SELECT, INSERT, UPDATE ON dna_records TO authenticated;
GRANT ALL ON dna_records TO service_role;
GRANT USAGE, SELECT ON SEQUENCE dna_records_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE dna_records_id_seq TO authenticated;

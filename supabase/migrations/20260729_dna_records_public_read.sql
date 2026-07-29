-- Allow any authenticated user to read DNA records.
-- Cross-device ownership verification (the core PINIT feature) requires User B
-- to look up User A's dna_record by dna_id when scanning a shared image.
-- Without this policy every cross-device scan returns "No Owner ID Found".

alter table dna_records enable row level security;

drop policy if exists "dna_records_select" on dna_records;
drop policy if exists "dna_records_insert" on dna_records;
drop policy if exists "dna_records_update" on dna_records;
drop policy if exists "Users can view own dna records" on dna_records;
drop policy if exists "Users can insert own dna records" on dna_records;
drop policy if exists "Users can update own dna records" on dna_records;

-- Any authenticated user can read any DNA record (needed for cross-device ownership lookup).
create policy "dna_records_select"
  on dna_records for select
  to authenticated
  using (true);

-- Users can only insert records where they are the owner.
create policy "dna_records_insert"
  on dna_records for insert
  to authenticated
  with check (user_id = auth.uid()::text);

-- Users can only update their own records.
create policy "dna_records_update"
  on dna_records for update
  to authenticated
  using (user_id = auth.uid()::text);

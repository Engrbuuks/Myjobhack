-- ============================================================
-- MYJOBHACK App — Migration 0020 · State on profiles for pool analytics
-- Run after 0019.
-- ============================================================

-- Profiles store country + city; add state so the dashboard can break
-- the pool down by state (Lagos, Oyo, etc.), which the memory address
-- pickers already collect elsewhere.
alter table profiles add column if not exists state text;
create index if not exists profiles_state_idx on profiles (state);
create index if not exists profiles_country_idx on profiles (country);

-- Marketing contacts carry geography too, so guest applicants count in
-- the geographic breakdowns even without a full profile.
alter table marketing_contacts add column if not exists country text;
alter table marketing_contacts add column if not exists state text;

notify pgrst, 'reload schema';

-- ---------- CREDENTIAL REQUESTS ----------
-- Track when staff asked a talent to upload credentials (via email).
create table if not exists credential_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  requested_by uuid references profiles(id),
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz
);
create index if not exists cr_profile_idx on credential_requests (profile_id, requested_at desc);
alter table credential_requests enable row level security;
create policy "cred req staff" on credential_requests
  for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';

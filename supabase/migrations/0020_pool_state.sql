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

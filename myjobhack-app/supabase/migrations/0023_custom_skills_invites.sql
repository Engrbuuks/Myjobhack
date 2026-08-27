-- ============================================================
-- MYJOBHACK App — Migration 0023
--  1. Custom (typed) areas of expertise on talent profiles
--  2. Profile-update invite tracking
-- Run after 0022.
-- ============================================================

-- Typed skills that aren't in the taxonomy list. Combined with taxonomy
-- expertise, the total is still capped at 6 in the UI.
alter table talent_profiles add column if not exists custom_skills text[] not null default '{}';

-- Track profile-update invitations sent to talent (for the admin button).
create table if not exists profile_update_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  requested_by uuid references profiles(id),
  requested_at timestamptz not null default now(),
  reason text
);
create index if not exists pur_profile_idx on profile_update_requests (profile_id, requested_at desc);
alter table profile_update_requests enable row level security;
create policy "pur staff" on profile_update_requests
  for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';

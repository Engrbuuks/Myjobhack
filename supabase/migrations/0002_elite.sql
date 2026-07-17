-- ============================================================
-- MYJOBHACK App — Migration 0002 · Elite peer visibility
-- Run in Supabase SQL Editor after 0001.
-- Lets VERIFIED Elite members see each other (roster & directory)
-- without opening profiles to anyone else.
-- ============================================================

create or replace function is_verified_elite() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from elite_memberships
    where talent_id = auth.uid() and status = 'verified'
  )
$$;

-- verified elite can see other verified memberships
create policy "elite peers read" on elite_memberships
  for select using (status = 'verified' and is_verified_elite());

-- verified elite can read the profiles behind those memberships
create policy "elite peer profiles read" on profiles
  for select using (
    is_verified_elite()
    and id in (select talent_id from elite_memberships where status = 'verified')
  );

-- verified elite can read peer talent headlines/niches for the directory
create policy "elite peer talent read" on talent_profiles
  for select using (
    is_verified_elite()
    and profile_id in (select talent_id from elite_memberships where status = 'verified')
  );

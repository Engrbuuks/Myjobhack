-- ============================================================
-- MYJOBHACK App — Migration 0016 · Fix silent job update failures
-- Run in Supabase SQL Editor after 0015.
--
-- The original policies used `for all using (...)` with no WITH CHECK.
-- On UPDATE, Postgres needs WITH CHECK to validate the row *after* the
-- change; without it, edits can silently affect zero rows — the save
-- appears to succeed while the value never changes.
-- ============================================================

drop policy if exists "jobs staff write" on jobs;
drop policy if exists "jobs org write" on jobs;

-- Staff (admin / recruiter) — full control
create policy "jobs staff write" on jobs
  for all
  using (is_staff())
  with check (is_staff());

-- Employers — full control of their own organisation's roles
create policy "jobs org write" on jobs
  for all
  using (org_id in (select org_id from org_members where profile_id = auth.uid()))
  with check (org_id in (select org_id from org_members where profile_id = auth.uid()));

-- Same latent issue on the tables edited alongside jobs
drop policy if exists "forms staff" on forms;
create policy "forms staff" on forms
  for all using (is_staff()) with check (is_staff());

drop policy if exists "form_fields staff" on form_fields;
create policy "form_fields staff" on form_fields
  for all using (is_staff()) with check (is_staff());

drop policy if exists "trainings staff" on trainings;
create policy "trainings staff" on trainings
  for all using (is_staff()) with check (is_staff());

-- Clear the stuck deadline on the Call Center Agent role
update jobs set closes_at = null
  where id = '318d6f12-352e-4e64-a7a8-50688f79a942';

notify pgrst, 'reload schema';

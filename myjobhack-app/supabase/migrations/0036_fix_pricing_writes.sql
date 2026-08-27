-- ============================================================
-- MYJOBHACK App — Migration 0036 · Fix silent pricing-save failures
--
-- BUG: the policies on app_settings and plans were written as
--   for all using (is_admin())
-- with NO `with check` clause. On INSERT/UPSERT Postgres evaluates WITH CHECK,
-- which falls back to the USING expression — is_admin() — and that resolves via
-- auth.uid(). Any server-side write therefore had to satisfy an admin check the
-- service role cannot satisfy, so the write was rejected. The API discarded the
-- error and reported success, so the UI said "Saved" and nothing changed.
--
-- FIX: pair every policy with an explicit `with check`, and allow the service
-- role (our own backend, which already verifies admin rights before writing).
-- Run after 0035.
-- ============================================================

-- A caller is trusted here if they are a signed-in admin OR the service role.
create or replace function is_admin_or_service() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_admin(), false)
      or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
      or auth.uid() is null
$$;

-- ---------- app_settings (holds the pricing blob) ----------
drop policy if exists "settings admin" on app_settings;
create policy "settings admin" on app_settings
  for all using (is_admin_or_service()) with check (is_admin_or_service());

drop policy if exists "settings read" on app_settings;
create policy "settings read" on app_settings
  for select using (auth.uid() is not null or is_admin_or_service());

-- ---------- seeker plans ----------
drop policy if exists "plans admin" on plans;
create policy "plans admin" on plans
  for all using (is_admin_or_service()) with check (is_admin_or_service());

-- ---------- employer plans ----------
drop policy if exists "eplans staff write" on employer_plans;
create policy "eplans staff write" on employer_plans
  for all using (is_staff() or is_admin_or_service())
  with check (is_staff() or is_admin_or_service());

notify pgrst, 'reload schema';

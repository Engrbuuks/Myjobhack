-- ============================================================
-- MYJOBHACK App — Migration 0033 · Fix silent role-change failure
--
-- BUG: trg_prevent_role_change silently reverted ANY role change unless
-- is_admin() was true. is_admin() resolves via auth.uid(), which is NULL for
-- service-role (backend) calls — so the admin API's role changes were quietly
-- undone with no error. The UI said "saved"; the database kept the old role.
--
-- FIX: allow the change when the caller is a real admin OR when the call comes
-- from the service role (our own server, which already checks admin rights in
-- /api/admin/manage before calling). Still blocks a signed-in non-admin from
-- escalating their own role — the original purpose of the guard.
-- Run after 0032.
-- ============================================================

create or replace function prevent_self_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_is_service boolean;
begin
  -- Service-role calls have no auth.uid() and carry the 'service_role' claim.
  v_is_service := (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or auth.uid() is null
  );

  if new.role is distinct from old.role
     and not is_admin()
     and not v_is_service then
    new.role := old.role;   -- block escalation by a signed-in non-admin
  end if;

  return new;
end $$;

drop trigger if exists trg_prevent_role_change on profiles;
create trigger trg_prevent_role_change
  before update on profiles
  for each row execute function prevent_self_role_change();

notify pgrst, 'reload schema';

-- ============================================================
-- MYJOBHACK App — Migration 0022 · Fix infinite recursion on profiles RLS
-- Run in Supabase SQL Editor.
--
-- Cause of "infinite recursion detected in policy for relation profiles":
--   1. The UPDATE policy's WITH CHECK sub-selected FROM profiles — that alone
--      recurses on every profile update.
--   2. is_admin()/is_staff() SELECT from profiles and were used in policies ON
--      profiles; if the function owner isn't RLS-exempt, the inner select
--      re-enters the same policies and loops.
--
-- Fix: make the role-lookup function explicitly bypass row security for its
-- own internal read (so it can never re-enter a profiles policy), and rewrite
-- the profiles policies so none of them sub-select profiles.
-- ============================================================

-- Role lookup that is GUARANTEED not to recurse: it turns row_security OFF for
-- the duration of its own SELECT. Because it's security definer, this is safe
-- and scoped to the function call only.
create or replace function current_user_role() returns text
language plpgsql stable security definer set search_path = public
set row_security = off as $$
declare v_role text;
begin
  select role::text into v_role from profiles where id = auth.uid();
  return coalesce(v_role, 'anon');
end $$;

-- Rebuild the helpers on top of the recursion-free lookup.
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select current_user_role() = 'admin'
$$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select current_user_role() in ('admin','recruiter')
$$;

-- ---- Rebuild every policy ON profiles so none recurse ----
drop policy if exists "own profile read" on profiles;
drop policy if exists "own profile update" on profiles;
drop policy if exists "admin profiles all" on profiles;
drop policy if exists "profiles_read" on profiles;
drop policy if exists "profiles_update_own" on profiles;
drop policy if exists "profiles_insert_own" on profiles;
drop policy if exists "profiles_admin_all" on profiles;

create policy "profiles_read" on profiles
  for select using (id = auth.uid() or is_staff());

-- No sub-select on profiles here — this was a direct recursion source.
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid());

create policy "profiles_admin_all" on profiles
  for all using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';

-- ---- Keep the role-escalation guard, recursion-free, via a trigger ----
-- (The old policy enforced this with a sub-select, which recursed. A trigger
--  does the same job without touching RLS.)
create or replace function prevent_self_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- If the row's role is being changed and the caller is not an admin, block it.
  if new.role is distinct from old.role and not is_admin() then
    new.role := old.role;   -- silently keep the old role
  end if;
  return new;
end $$;

drop trigger if exists trg_prevent_role_change on profiles;
create trigger trg_prevent_role_change
  before update on profiles
  for each row execute function prevent_self_role_change();

notify pgrst, 'reload schema';

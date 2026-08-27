-- ============================================================
-- MYJOBHACK App — Migration 0018 · Registration hardening
-- Run in Supabase SQL Editor.
--
-- Problem: handle_new_user() runs inside the auth signup transaction.
-- If it throws for any reason (duplicate row, bad enum value, missing
-- table), Supabase aborts the whole signup and the person sees
-- "Database error saving new user" — or nothing at all.
--
-- This makes the trigger defensive: a profile is still created, but a
-- failure in the optional parts can never block registration.
-- ============================================================

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role   user_role;
  v_name   text;
begin
  -- Fall back to job_seeker if the role is missing or not a valid enum value
  begin
    v_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'job_seeker');
  exception when others then
    v_role := 'job_seeker';
  end;

  v_name := coalesce(new.raw_user_meta_data->>'full_name', '');

  -- Profile: on conflict do nothing, so a repeat never aborts signup
  begin
    insert into profiles (id, email, full_name, role)
    values (new.id, coalesce(new.email, ''), v_name, v_role)
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user: profile insert failed for %: %', new.id, sqlerrm;
  end;

  -- Talent profile is optional — never let it break registration
  if v_role in ('job_seeker', 'elite_member') then
    begin
      insert into talent_profiles (profile_id) values (new.id)
      on conflict (profile_id) do nothing;
    exception when others then
      raise warning 'handle_new_user: talent_profile insert failed for %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: create profiles for any existing auth users that lack one
insert into profiles (id, email, full_name, role)
select u.id,
       coalesce(u.email, ''),
       coalesce(u.raw_user_meta_data->>'full_name', ''),
       coalesce((u.raw_user_meta_data->>'role')::user_role, 'job_seeker')
from auth.users u
left join profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- And their talent profiles
insert into talent_profiles (profile_id)
select p.id from profiles p
left join talent_profiles t on t.profile_id = p.id
where t.profile_id is null
  and p.role in ('job_seeker', 'elite_member')
on conflict (profile_id) do nothing;

notify pgrst, 'reload schema';

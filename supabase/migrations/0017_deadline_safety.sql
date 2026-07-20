-- ============================================================
-- MYJOBHACK App — Migration 0017 · Deadline safety net
-- Run in Supabase SQL Editor. Independent of any app deploy.
--
-- Symptom: deadlines were being stored several hours behind the
-- time entered, so newly published roles were instantly expired.
-- This makes the database itself reject that outcome.
-- ============================================================

-- 1) Make sure the column carries timezone information.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'jobs' and column_name = 'closes_at'
      and data_type = 'timestamp without time zone'
  ) then
    alter table jobs
      alter column closes_at type timestamptz using closes_at at time zone 'UTC';
  end if;
end $$;

-- 2) Refuse to store a deadline that is already in the past on a
--    published role. Instead of silently hiding the job, treat it as
--    "no deadline" so the role stays visible.
create or replace function jobs_guard_deadline()
returns trigger language plpgsql as $$
begin
  if new.closes_at is not null
     and new.status = 'published'
     and new.closes_at <= now() then
    -- the entered value cannot be what was meant; drop it rather than
    -- publishing a role nobody can see
    new.closes_at := null;
  end if;
  return new;
end $$;

drop trigger if exists jobs_guard_deadline_trg on jobs;
create trigger jobs_guard_deadline_trg
  before insert or update on jobs
  for each row execute function jobs_guard_deadline();

-- 3) Clear any deadline already in the past on published roles.
update jobs
set closes_at = null
where status = 'published'
  and closes_at is not null
  and closes_at <= now();

notify pgrst, 'reload schema';

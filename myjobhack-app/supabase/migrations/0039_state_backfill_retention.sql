-- ============================================================
-- MYJOBHACK App — Migration 0039
--   (a) Fix the "unspecified state" bug — backfill profiles.state
--   (b) Retention system: 30/60/90 check-ins + retention outcomes
-- Run after 0038.
-- ============================================================

-- ---------- (a) STATE BACKFILL ----------
-- The location picker writes the state into profiles.city, but pool analytics
-- read profiles.state — which was never populated, so every state rendered as
-- "unspecified". Copy across for everyone who already has a city.
update profiles
   set state = city
 where (state is null or state = '')
   and city is not null and city <> '';

-- Keep them aligned going forward, whichever field a form writes to.
create or replace function sync_profile_state() returns trigger
language plpgsql as $$
begin
  if new.city is not null and new.city <> '' and (new.state is null or new.state = '') then
    new.state := new.city;
  elsif new.state is not null and new.state <> '' and (new.city is null or new.city = '') then
    new.city := new.state;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_profile_state on profiles;
create trigger trg_sync_profile_state before insert or update on profiles
  for each row execute function sync_profile_state();

-- ---------- (b) RETENTION ----------
-- Everyone in this industry is paid at the moment of hire. This is the record
-- of what happened afterwards — the data no competitor holds.

alter table placements add column if not exists start_date date;
alter table placements add column if not exists retention_status text not null default 'active';
  -- active | retained_30 | retained_60 | retained_90 | left_early | replaced
alter table placements add column if not exists left_at date;
alter table placements add column if not exists left_reason text;
alter table placements add column if not exists performance_rating int;  -- 1-5, from the employer

create index if not exists placements_retention_idx on placements (retention_status);

-- Scheduled check-ins with both sides of the placement.
create table if not exists placement_checkins (
  id uuid primary key default gen_random_uuid(),
  placement_id uuid not null references placements(id) on delete cascade,
  day_marker int not null,                 -- 30 | 60 | 90
  due_on date not null,
  completed_at timestamptz,

  -- what we learn
  still_employed boolean,
  employer_rating int,                     -- 1-5
  talent_sentiment int,                    -- 1-5
  employer_notes text,
  talent_notes text,
  risk_flag boolean not null default false, -- someone is about to leave

  completed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (placement_id, day_marker)
);
create index if not exists checkins_due_idx on placement_checkins (due_on) where completed_at is null;

alter table placement_checkins enable row level security;
drop policy if exists "checkins staff" on placement_checkins;
create policy "checkins staff" on placement_checkins
  for all using (is_staff() or is_admin_or_service())
  with check (is_staff() or is_admin_or_service());

-- When a placement is recorded, schedule its three check-ins automatically.
create or replace function schedule_checkins() returns trigger
language plpgsql security definer set search_path = public as $$
declare base_date date;
begin
  base_date := coalesce(new.start_date, new.created_at::date, current_date);
  insert into placement_checkins (placement_id, day_marker, due_on)
  values (new.id, 30, base_date + 30),
         (new.id, 60, base_date + 60),
         (new.id, 90, base_date + 90)
  on conflict (placement_id, day_marker) do nothing;
  return new;
end $$;

drop trigger if exists trg_schedule_checkins on placements;
create trigger trg_schedule_checkins after insert on placements
  for each row execute function schedule_checkins();

-- Backfill check-ins for placements that already exist.
insert into placement_checkins (placement_id, day_marker, due_on)
select p.id, m.d, coalesce(p.start_date, p.created_at::date) + m.d
  from placements p
 cross join (values (30),(60),(90)) as m(d)
on conflict (placement_id, day_marker) do nothing;

notify pgrst, 'reload schema';

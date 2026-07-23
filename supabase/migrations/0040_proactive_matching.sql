-- ============================================================
-- MYJOBHACK App — Migration 0040 · Proactive seeker matching
--
-- Matching was employer-triggered only: if no employer clicked "find matches",
-- a seeker saw nothing. This makes the platform tell candidates when a job
-- fits them, which is the payoff for sitting the assessment.
--
-- Deliberately NOT "match everyone against everything nightly" — that mostly
-- recomputes unchanged results at real AI cost. Instead we match a JOB against
-- the pool when it is posted, and re-match a SEEKER when their profile changes.
-- Run after 0039.
-- ============================================================

-- Track what a seeker has already been told about, so we never notify twice.
alter table job_matches add column if not exists notified_at timestamptz;
alter table job_matches add column if not exists seen_by_talent boolean not null default false;
create index if not exists jm_notify_idx on job_matches (talent_id, notified_at)
  where notified_at is null;

-- Marks a seeker as needing a re-match (set when their profile or band changes).
alter table talent_profiles add column if not exists match_dirty boolean not null default true;
alter table talent_profiles add column if not exists last_matched_at timestamptz;
create index if not exists tp_match_dirty_idx on talent_profiles (match_dirty) where match_dirty = true;

-- Any change to the fields matching depends on marks the profile for re-match.
create or replace function mark_match_dirty() returns trigger
language plpgsql as $$
begin
  if new.niche_id is distinct from old.niche_id
     or new.expected_role_level is distinct from old.expected_role_level
     or new.competency_band is distinct from old.competency_band
     or new.custom_skills is distinct from old.custom_skills
     or new.preferred_work_mode is distinct from old.preferred_work_mode then
    new.match_dirty := true;
  end if;
  return new;
end $$;

drop trigger if exists trg_mark_match_dirty on talent_profiles;
create trigger trg_mark_match_dirty before update on talent_profiles
  for each row execute function mark_match_dirty();

-- Seekers may read their own matches — this is what powers their dashboard.
drop policy if exists "job_matches own talent read" on job_matches;
create policy "job_matches own talent read" on job_matches
  for select using (talent_id = auth.uid() or is_staff() or is_admin_or_service());

-- Notification settings so we never spam: threshold and weekly cap are yours to tune.
insert into app_settings (key, value) values
  ('matching', jsonb_build_object(
    'notify_threshold', 72,        -- only tell them about genuinely strong matches
    'max_notifications_per_week', 2,
    'email_enabled', true
  ))
on conflict (key) do update set value = app_settings.value || excluded.value;

notify pgrst, 'reload schema';

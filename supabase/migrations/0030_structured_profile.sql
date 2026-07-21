-- ============================================================
-- MYJOBHACK App — Migration 0030 · Structured profile
-- Work-history entries so employers can evaluate a candidate from a
-- platform-rendered profile card WITHOUT the résumé (which leaks contact
-- details). The résumé becomes the reward for unlock/placement.
-- Run after 0029.
-- ============================================================

create table if not exists work_experiences (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talent_profiles(profile_id) on delete cascade,
  title text not null default '',
  company text not null default '',
  employment_type employment_type not null default 'full_time',
  start_date date,
  end_date date,               -- null = current
  is_current boolean not null default false,
  location text,
  summary text,                -- what they did / achieved
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists work_exp_talent_idx on work_experiences (talent_id, sort);

alter table work_experiences enable row level security;

-- Talent manages their own; staff can read all; employers read via the card endpoint (service role).
drop policy if exists "work_exp own" on work_experiences;
create policy "work_exp own" on work_experiences
  for all using (talent_id = auth.uid() or is_staff()) with check (talent_id = auth.uid() or is_staff());

-- Profile completion should now also reward having experience entries.
-- (completion recompute is handled app-side; this is just the data home.)

notify pgrst, 'reload schema';

-- ---------- Job-specific assessments ----------
-- Link an assessment to a specific posting (null = general competency test).
alter table assessments add column if not exists job_id uuid references jobs(id) on delete set null;
alter table assessments add column if not exists ordered_by uuid references profiles(id) on delete set null; -- employer who ordered it
create index if not exists asmt_job_idx on assessments (job_id);

-- Seed the per-candidate job-assessment price into pricing (employer pays per finalist).
insert into app_settings (key, value) values
  ('pricing', jsonb_build_object('job_assessment_per_candidate_ngn', 5000))
on conflict (key) do update set value = app_settings.value || excluded.value;

notify pgrst, 'reload schema';

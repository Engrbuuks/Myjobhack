-- ============================================================
-- MYJOBHACK App — Migration 0004 · Interviews
-- Run in Supabase SQL Editor after 0003.
-- Interview invitations, scheduling (fixed slot or Calendly),
-- competency scorecards, and outcomes.
-- ============================================================

create type interview_status as enum ('invited', 'scheduled', 'completed', 'no_show', 'cancelled');
create type interview_mode as enum ('video', 'phone', 'in_person');
create type interview_outcome as enum ('pending', 'advanced', 'hold', 'rejected');

create table interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  talent_id uuid not null references profiles(id) on delete cascade,
  org_id uuid references organizations(id),
  scheduled_by uuid not null references profiles(id),
  round smallint not null default 1,
  mode interview_mode not null default 'video',
  scheduled_at timestamptz,                -- null when talent picks via Calendly
  duration_min int default 30,
  location_or_link text default '',
  calendly_url text default '',
  message text default '',
  status interview_status not null default 'invited',
  outcome interview_outcome not null default 'pending',
  scorecard jsonb default '[]'::jsonb,     -- [{name, rating 1-5, note}]
  feedback text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interviews_application_idx on interviews(application_id);
create index interviews_talent_idx on interviews(talent_id);
create index interviews_job_idx on interviews(job_id);
create index interviews_org_idx on interviews(org_id);

alter table interviews enable row level security;

-- talent sees their own interviews (scorecard/feedback are read via API-shaped pages only,
-- but row visibility for schedule details is intended)
create policy "interviews talent read" on interviews
  for select using (talent_id = auth.uid());

-- staff manage everything
create policy "interviews staff all" on interviews
  for all using (is_staff()) with check (is_staff());

-- employer org members read their org's interviews (writes go through the API)
create policy "interviews org read" on interviews
  for select using (
    org_id in (select org_id from org_members where profile_id = auth.uid())
  );

-- 0051 · Bulk interview scheduling.
--
-- TWO BLOCKERS THIS REMOVES:
--
-- 1. interviews.talent_id is NOT NULL, so a guest applicant cannot be
--    scheduled at all. Most applicants arrive as guests, which means the
--    interview system silently excluded the majority of the people you would
--    actually want to interview.
--
-- 2. There is no way to tell which interviews were arranged together. Sending
--    33 invitations one at a time gives no way to review the run, spot a
--    clash, or cancel the batch if a date moves.

-- ---------- 1 · Guests can be interviewed ----------

alter table interviews alter column talent_id drop not null;

-- Contact details for someone with no profile row.
alter table interviews
  add column if not exists guest_name text,
  add column if not exists guest_email text;

-- Every interview must identify a person somehow.
alter table interviews drop constraint if exists interviews_has_person;
alter table interviews add constraint interviews_has_person
  check (talent_id is not null or guest_email is not null);

comment on column interviews.talent_id is
  'Null for guest applicants, who have no profile. Use guest_name and guest_email in that case.';

-- ---------- 2 · Batches ----------

create table if not exists interview_batches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  created_by uuid references profiles(id),

  -- The rules the slots were generated from, kept so a batch can be
  -- explained or regenerated later rather than being a mystery run of times.
  slot_minutes int not null default 30,
  gap_minutes int not null default 0,
  day_start time not null default '09:00',
  day_end time not null default '17:00',
  timezone text not null default 'Africa/Lagos',
  mode text not null default 'video',
  location_or_link text default '',
  message text default '',

  invited_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table interviews
  add column if not exists batch_id uuid references interview_batches(id) on delete set null;

create index if not exists interviews_batch_idx on interviews(batch_id);
create index if not exists interviews_scheduled_idx on interviews(scheduled_at);

alter table interview_batches enable row level security;

drop policy if exists "interview_batches staff" on interview_batches;
create policy "interview_batches staff" on interview_batches
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role in ('admin','recruiter'))
  );

drop policy if exists "interview_batches own job" on interview_batches;
create policy "interview_batches own job" on interview_batches
  for select using (
    job_id in (
      select j.id from jobs j
      join org_members m on m.org_id = j.org_id
      where m.profile_id = auth.uid()
    )
  );

-- Two people in the same slot is the failure this prevents. Enforced in the
-- database rather than trusted to the application, because a double booking
-- is discovered by two candidates arriving at once.
create unique index if not exists interviews_no_double_booking
  on interviews (job_id, scheduled_at)
  where scheduled_at is not null and status <> 'cancelled';

comment on table interview_batches is
  'One row per bulk scheduling run. Records the slot rules so a batch can be reviewed, explained or rescheduled as a unit.';

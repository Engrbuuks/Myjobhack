-- 0045 · Filling gaps in application answers.
--
-- Two mechanisms, for the same problem: a question that was optional (or was
-- edited after people applied) leaves holes in the data you need to sort on.
--
-- 1. resume_signals — what the applicant's own CV says about a keyword set.
--    A HINT, never an answer. Recorded separately from `answers` so a guess is
--    never mistaken later for something the candidate actually declared.
--
-- 2. answer_requests — a tokenised one-click link emailed to the applicant.
--    They tap "Ibadan", it writes to `answers`, no login and no reply to read.

-- ---------- 1 · Résumé keyword signals ----------

alter table applications
  add column if not exists resume_signals jsonb,
  add column if not exists resume_scanned_at timestamptz;

comment on column applications.resume_signals is
  'Keyword hits found in the CV: {"hits":[{"term":"Ibadan","count":3,"in_header":true}],"top":"Ibadan"}. A hint for triage — never treat as a declared answer.';

-- ---------- 2 · One-click answer requests ----------

create table if not exists answer_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  field_id uuid not null,                  -- the form_fields row being filled
  question text not null,                  -- snapshot: the form may be edited later
  options jsonb not null default '[]'::jsonb,
  token text not null unique,
  sent_at timestamptz,
  send_error text,
  answered_at timestamptz,
  answered_value text,
  created_at timestamptz not null default now(),
  -- One outstanding request per person per question.
  unique (application_id, field_id)
);

create index if not exists answer_requests_token_idx on answer_requests(token);
create index if not exists answer_requests_job_idx on answer_requests(job_id);
-- Powers the daily send cap on Resend's free tier.
create index if not exists answer_requests_sent_idx on answer_requests(sent_at);

alter table answer_requests enable row level security;

-- Staff only. The public answer page runs through the service role and looks
-- the row up by token, so no anonymous policy is needed — and none is wanted,
-- since a readable table would expose every applicant's token.
drop policy if exists "answer_requests staff" on answer_requests;
create policy "answer_requests staff" on answer_requests
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role in ('admin','recruiter'))
  );

-- Employers may read requests for their own jobs, to see who has replied.
drop policy if exists "answer_requests own job" on answer_requests;
create policy "answer_requests own job" on answer_requests
  for select using (
    job_id in (
      select j.id from jobs j
      join org_members m on m.org_id = j.org_id
      where m.profile_id = auth.uid()
    )
  );

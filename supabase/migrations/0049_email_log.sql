-- 0049 · Email send log and daily allowance.
--
-- THREE PROBLEMS WITH BULK SENDING AS IT STANDS:
--
-- 1. No cap. Emailing 100 applicants spends the entire daily allowance on the
--    provider's free tier, after which application receipts, invites and
--    one-click answer requests fail silently. A recruiter clicking "email
--    these 87" has no idea they have just broken transactional mail for the
--    rest of the day.
--
-- 2. No record. Nothing stored about who was emailed, when, or what was said.
--    Get interrupted mid-batch and there is no way to know who already heard
--    from you — so people get contacted twice, or not at all.
--
-- 3. The unsubscribe link points at /portal/account, which guest applicants
--    cannot reach because they have no account. An unsubscribe header that
--    leads to a login wall is worse than none: it invites spam complaints,
--    and those damage sending reputation for every message the platform sends.
--
-- This table fixes 1 and 2. The unsubscribe token here fixes 3.

create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),

  recipient text not null,
  subject text not null,
  kind text not null default 'bulk',        -- bulk | transactional
  job_id uuid references jobs(id) on delete set null,
  application_id uuid references applications(id) on delete set null,
  profile_id uuid references profiles(id) on delete set null,

  sent_by uuid references profiles(id),
  sent_at timestamptz not null default now(),
  status text not null default 'sent',      -- sent | failed
  error text,

  -- Snippet only. Storing whole message bodies for every send bloats the
  -- table quickly and adds nothing to the "who did we contact" question.
  preview text
);

create index if not exists email_log_sent_at_idx on email_log(sent_at desc);
create index if not exists email_log_recipient_idx on email_log(lower(recipient));
create index if not exists email_log_job_idx on email_log(job_id);

alter table email_log enable row level security;

drop policy if exists "email_log staff" on email_log;
create policy "email_log staff" on email_log
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role in ('admin','recruiter'))
  );

-- ---------- Unsubscribe that works without an account ----------

create table if not exists email_optouts (
  email text primary key,
  token text unique not null default replace(gen_random_uuid()::text, '-', ''),
  opted_out_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_optouts_token_idx on email_optouts(token);

alter table email_optouts enable row level security;

drop policy if exists "email_optouts staff" on email_optouts;
create policy "email_optouts staff" on email_optouts
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role in ('admin','recruiter'))
  );

-- How many bulk messages have gone out since midnight. Used to enforce the
-- cap in one place rather than trusting each caller to count correctly.
create or replace function bulk_sent_today()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::int from email_log
  where kind = 'bulk'
    and status = 'sent'
    and sent_at >= date_trunc('day', now());
$$;

comment on table email_log is
  'Every message sent, for auditing and for enforcing the daily provider allowance.';
comment on table email_optouts is
  'Per-address unsubscribe tokens, so guest applicants without accounts can opt out.';

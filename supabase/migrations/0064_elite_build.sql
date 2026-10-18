-- ============================================================
-- 0064 · Elite: make every promise on the membership page real.
--
-- Run after 0063. Safe to run more than once.
--
-- WHAT THIS CLOSES. The Elite page sold six perks. Two of them were copy
-- only: nothing ranked Elite members ahead of anyone for employers, and no
-- column anywhere gave them earlier sight of a role. Two more were
-- overstated: assessments were already capped and the toolkit was already
-- metered, while the page said unlimited. This migration gives the honest
-- version somewhere to live, and adds the perks that were agreed:
--
--   1 · an early access window on a job, enforced in the policy as well as
--       in every query, so it cannot be stepped around
--   2 · proof a member can carry off the platform: a public page on an
--       unguessable address, a verification code, and a letter
--   3 · chapter events with RSVPs, so "meet locally" means something
--   4 · an answer deadline on an Elite application, with the clock stored
--       rather than implied
--   5 · referral attribution, recorded and credited. NO MONEY: there is
--       deliberately no payout column, because a cash bounty was not agreed
--   6 · induction classes, and a cost unit on AI runs so the toolkit can be
--       budgeted instead of promised without limit
--
-- Nothing here spends money. Every new surface carries row level security
-- written in this same file.
-- ============================================================

-- ------------------------------------------------------------
-- 0 · Helpers used by the policies below
-- ------------------------------------------------------------

-- Is this person a verified Elite member?
--
-- security definer so a policy on another table can ask the question without
-- that table's reader needing rights over elite_memberships. search_path is
-- pinned because a definer function that resolves names through the caller's
-- path is how privilege escalation gets in.
/*
 * NO PARAMETER, AND THAT IS THE SECURITY DECISION.
 *
 * Every function in the public schema is also a PostgREST endpoint. Written
 * as elite_verified(uid uuid default auth.uid()) these read naturally in a
 * policy and are a membership oracle from outside:
 *
 *   POST /rest/v1/rpc/elite_verified {"uid":"<anybody's profile id>"}
 *
 * with nothing but the anon key, answering true or false about any person on
 * the platform, and elite_chapter answering which city they meet in.
 *
 * Revoking execute is NOT the fix: a row level security expression is
 * evaluated with the privileges of the querying role, so revoking it from
 * authenticated makes the whole jobs policy fail with "permission denied for
 * function" and every signed in user sees no jobs at all. Tested, not
 * assumed.
 *
 * So the parameter goes. These answer about the caller and about nobody else,
 * which is all any policy here ever needed.
 */
create or replace function elite_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from elite_memberships em
     where em.talent_id = auth.uid()
       and em.status = 'verified'
  );
$$;

comment on function elite_verified() is
  'True when the CALLER holds a verified Elite membership. Takes no argument on purpose: a uuid parameter would make this an open membership oracle over PostgREST. Returns false for anon.';

-- Which chapter is the caller a verified member of? Null for everyone else.
create or replace function elite_chapter()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select em.chapter_id from elite_memberships em
   where em.talent_id = auth.uid() and em.status = 'verified'
   limit 1;
$$;

-- Any earlier form of these, which took a uuid, must not survive the upgrade.
drop function if exists elite_verified(uuid);
drop function if exists elite_chapter(uuid);

-- A short random token. Used for public addresses and verification codes,
-- never a sequence: a sequential address invites someone to walk the whole
-- membership by counting. gen_random_uuid is core in the Postgres versions
-- Supabase runs, so this needs no extension.
create or replace function elite_token(len int default 12)
returns text
language sql
volatile
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, greatest(6, least(32, len)));
$$;

-- ------------------------------------------------------------
-- 1 · Early access on a role
-- ------------------------------------------------------------

-- Until this moment passes, a published job is visible to verified Elite
-- members and to nobody else. Null means it was never held back.
alter table jobs add column if not exists elite_until timestamptz;

comment on column jobs.elite_until is
  'Verified Elite members only until this time. Null means open to everyone from publication.';

create index if not exists jobs_elite_until_idx on jobs (elite_until)
  where elite_until is not null;

/*
 * The window belongs in the policy, not only in the pages.
 *
 * Three of the four places that list jobs read with the service role, which
 * ignores policies, so the queries must filter too and they do. But the
 * seeker board reads as the signed in user, and PostgREST is reachable
 * directly with any user's token. A window enforced only in a page is a
 * window that is open to anyone who reads the network tab.
 */
drop policy if exists "jobs read published" on jobs;
create policy "jobs read published" on jobs
  for select using (
    is_staff()
    or (org_id in (select org_id from org_members where profile_id = auth.uid()))
    or (
      status = 'published'
      and (elite_until is null or elite_until <= now() or elite_verified())
    )
  );

-- ------------------------------------------------------------
-- 2 · Proof a member can carry anywhere
-- ------------------------------------------------------------

alter table elite_memberships
  -- The public address. Random, so the directory cannot be enumerated.
  add column if not exists public_slug text,
  -- Off until the member turns it on. A verified credential is still their
  -- business, not ours to publish.
  add column if not exists public_profile boolean not null default false,
  -- Induction class, for the card and the class roll.
  add column if not exists class_year int,
  -- Standing earned by bringing people in. A count, never money.
  add column if not exists referral_credits int not null default 0,
  -- What the member chose to show on the public page.
  add column if not exists public_headline text,
  add column if not exists public_institution text;

/*
 * THE VERIFICATION CODE DOES NOT LIVE IN THAT TABLE, AND THIS IS THE MOST
 * IMPORTANT DECISION IN THIS MIGRATION.
 *
 * Migration 0002 added "elite peers read": a verified member may select every
 * verified membership row. That is right for a directory, and it is a
 * catastrophe for a secret. A verification code sitting in that row would be
 * readable by all 214 members, and a code is enough to pull somebody's
 * credential out of /verify, including the credential of a member who chose
 * NOT to publish a public page.
 *
 * So the code and the referrer sit in their own table with row level security
 * on and NO POLICY AT ALL. Nothing reaches them except the service role,
 * which is the three routes that need them. A future `select("*")` against
 * elite_memberships cannot leak what is not in it.
 */
create table if not exists elite_secrets (
  talent_id uuid primary key references talent_profiles(profile_id) on delete cascade,
  verify_code text not null,
  -- Who recommended this member. Attribution, not a social graph for peers
  -- to browse.
  referred_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists elite_secrets_code_idx on elite_secrets (verify_code);

alter table elite_secrets enable row level security;

-- Deliberately no policy. With row level security on and nothing granted, a
-- signed in user reads nothing here, and that is the whole point. If a future
-- migration adds a policy to this table, the reviewer should ask why.

comment on column elite_memberships.public_slug is
  'Random public address for this member page. Never sequential, never the member number.';
comment on table elite_secrets is
  'Verification codes and referral attribution. Service role only: elite_memberships is peer readable and these must not be.';
comment on column elite_memberships.referral_credits is
  'Standing earned by bringing in verified members. Deliberately not money.';

create unique index if not exists elite_public_slug_idx on elite_memberships (public_slug)
  where public_slug is not null;

-- Give every verified member a slug, a code and a class, now and in future.
update elite_memberships
   set public_slug = coalesce(public_slug, elite_token(12)),
       class_year  = coalesce(class_year, extract(year from verified_at)::int)
 where status = 'verified';

insert into elite_secrets (talent_id, verify_code)
select em.talent_id, upper(elite_token(8))
  from elite_memberships em
 where em.status = 'verified'
on conflict (talent_id) do nothing;

create or replace function elite_fill_tokens()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'verified' then
    new.public_slug := coalesce(new.public_slug, elite_token(12));
    new.class_year  := coalesce(new.class_year, extract(year from coalesce(new.verified_at, now()))::int);
  end if;
  return new;
end $$;

drop trigger if exists elite_fill_tokens_trg on elite_memberships;
create trigger elite_fill_tokens_trg
  before insert or update on elite_memberships
  for each row execute function elite_fill_tokens();

-- The code is a row in another table, so it is written after the membership
-- exists rather than alongside it. Issued once and never reissued: a code
-- that changed would invalidate every letter already sent out.
create or replace function elite_issue_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'verified' then
    insert into elite_secrets (talent_id, verify_code)
    values (new.talent_id, upper(elite_token(8)))
    on conflict (talent_id) do nothing;
  end if;
  return null;
end $$;

drop trigger if exists elite_issue_code_trg on elite_memberships;
create trigger elite_issue_code_trg
  after insert or update of status on elite_memberships
  for each row execute function elite_issue_code();

/*
 * The public page does NOT read through a policy.
 *
 * There is no anon select policy on elite_memberships and there must not be:
 * the row carries the reviewer, the referrer and the application history. The
 * public page reads with the service role and names the handful of fields it
 * is allowed to show, which is a list in one file rather than a policy
 * someone widens by accident later.
 */

-- ------------------------------------------------------------
-- 3 · Chapter events
-- ------------------------------------------------------------

create table if not exists chapter_events (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  title text not null,
  details text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text,
  -- An online meetup has a link instead of an address.
  joining_link text,
  capacity int,
  -- Employers attending, as plain text. No invitations, no money.
  guests text,
  created_by uuid references profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists chapter_events_chapter_idx
  on chapter_events (chapter_id, starts_at desc);

create table if not exists chapter_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references chapter_events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  -- going | not_going. A withdrawn RSVP is a row that says not_going, so the
  -- count of a cancelled seat is recoverable.
  response text not null default 'going',
  created_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

create index if not exists chapter_event_rsvps_event_idx
  on chapter_event_rsvps (event_id, response);

alter table chapter_events enable row level security;
alter table chapter_event_rsvps enable row level security;

-- Read: staff, or a verified member of that chapter. Nobody else, including
-- a verified member of a different city.
drop policy if exists "chapter events read" on chapter_events;
create policy "chapter events read" on chapter_events
  for select using (is_staff() or chapter_id = elite_chapter());

-- Write: staff only. Members RSVP, they do not create events.
drop policy if exists "chapter events staff write" on chapter_events;
create policy "chapter events staff write" on chapter_events
  for all using (is_staff()) with check (is_staff());

-- An RSVP is the member's own row. The attendance count is computed with the
-- service role and returned as a number, so one member never reads the list
-- of who else is coming.
drop policy if exists "rsvp own" on chapter_event_rsvps;
create policy "rsvp own" on chapter_event_rsvps
  for all using (profile_id = auth.uid() or is_staff())
  with check (
    (profile_id = auth.uid()
     and response in ('going', 'not_going')
     and exists (
       select 1 from chapter_events e
        where e.id = event_id
          and e.cancelled_at is null
          and e.chapter_id = elite_chapter()
     ))
    or is_staff()
  );

-- ------------------------------------------------------------
-- 4 · The answer guarantee
-- ------------------------------------------------------------

alter table applications
  -- Set when a verified Elite member applies. Null for everyone else, which
  -- is also what makes the perk checkable rather than a claim.
  add column if not exists answer_due_at timestamptz,
  -- Stamped the first time the status moves off submitted.
  add column if not exists answered_at timestamptz,
  -- Set by the cron when the deadline passes with no answer.
  add column if not exists sla_breached_at timestamptz;

comment on column applications.answer_due_at is
  'The answer deadline for a verified Elite applicant. Null means no guarantee applies.';

create index if not exists applications_sla_idx
  on applications (answer_due_at)
  where answer_due_at is not null and answered_at is null;

-- Backfill is deliberately NOT done. A deadline cannot be applied to an
-- application that was submitted before the promise existed, and inventing
-- one would show employers as late for something they never agreed to.

-- ------------------------------------------------------------
-- 5 · Referrals, with no money anywhere in the design
-- ------------------------------------------------------------

create table if not exists elite_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  -- Lowercased at write time so one address is one invitation.
  invited_email text not null,
  code text not null,
  /*
   * Was that address already registered when the invitation was made?
   *
   * The route used to answer 409 "someone is already registered with that
   * address", which is a free lookup service for whether a named person has
   * an account here: ten probes a day against anyone an attacker cares
   * about. It now records the invitation either way and answers identically,
   * and this flag is what stops an ineligible one ever being credited.
   */
  invitee_existed boolean not null default false,
  -- Filled when that person registers and is verified.
  accepted_profile_id uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (referrer_id, invited_email)
);

create unique index if not exists elite_referrals_code_idx on elite_referrals (code);
create index if not exists elite_referrals_email_idx on elite_referrals (lower(invited_email));

alter table elite_referrals enable row level security;

-- A member sees their own invitations and nobody else's.
drop policy if exists "referrals own" on elite_referrals;
create policy "referrals own" on elite_referrals
  for select using (referrer_id = auth.uid() or is_staff());

-- Insert is through the route, which holds the service role, because the
-- checks that matter here are not expressible as a policy: that the address
-- is not the member's own, and that it is not already a member.
drop policy if exists "referrals staff write" on elite_referrals;
create policy "referrals staff write" on elite_referrals
  for all using (is_staff()) with check (is_staff());

-- ------------------------------------------------------------
-- 6 · Toolkit cost, so an allowance can be budgeted
-- ------------------------------------------------------------

-- What this run cost in credits. One by default, so every row already
-- recorded stays valid and the ledger does not need rewriting.
alter table ai_runs add column if not exists cost int not null default 1;

comment on column ai_runs.cost is
  'Credits this run consumed. Weighted per tool from measured tokens, defaulting to one.';

create index if not exists ai_runs_profile_month_idx
  on ai_runs (profile_id, created_at desc);

-- ------------------------------------------------------------
-- 6b · Spending a credit, atomically
-- ------------------------------------------------------------

/*
 * Checking the balance and then spending it are two statements, and between
 * them a second request reads the same balance.
 *
 * The toolkit gate read the month's spend, decided there was room, called the
 * model, and only then wrote the ai_runs row. Twenty requests fired together
 * all read the same balance and all passed, so an allowance of sixty credits
 * could buy a hundred and eighty. The check was in the right place and still
 * bought nothing.
 *
 * This writes the row ONLY if the sums are under both caps, in one statement,
 * and hands back the row id. No room means no row and no id, and the caller
 * refuses before the model is touched. The output is filled in afterwards.
 */
create or replace function ai_credits_spend(
  p_profile uuid,
  p_tool ai_tool,
  p_cost int,
  p_monthly_cap int,
  p_daily_cap int,
  p_month_start timestamptz,
  p_day_start timestamptz
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  spent_month int;
  spent_day int;
  new_id uuid;
begin
  if p_cost is null or p_cost < 1 then p_cost := 1; end if;

  -- One row per person at a time. Two requests from the same account queue
  -- rather than race; two different accounts never touch the same lock.
  perform pg_advisory_xact_lock(hashtext('ai_credits:' || p_profile::text));

  select coalesce(sum(greatest(cost, 1)), 0) into spent_month
    from ai_runs where profile_id = p_profile and created_at >= p_month_start;

  select coalesce(sum(greatest(cost, 1)), 0) into spent_day
    from ai_runs where profile_id = p_profile and created_at >= p_day_start;

  if spent_month + p_cost > p_monthly_cap then return null; end if;
  if spent_day + p_cost > p_daily_cap then return null; end if;

  insert into ai_runs (profile_id, tool, cost, input, model)
  values (p_profile, p_tool, p_cost, '{}'::jsonb, 'reserved')
  returning id into new_id;

  return new_id;
end $$;

-- Only the service role calls this. A signed in user who could call it would
-- be able to spend their own allowance without a run, or probe the caps.
revoke all on function ai_credits_spend(uuid, ai_tool, int, int, int, timestamptz, timestamptz) from public;

-- ------------------------------------------------------------
-- 6c · Functions that must not be reachable as an endpoint
-- ------------------------------------------------------------

/*
 * ai_credits_spend writes a chargeable row, and nothing but a route holding
 * the service key should be able to call it. No policy depends on it, so
 * revoking execute here costs nothing and closes the endpoint.
 */
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function ai_credits_spend(uuid, ai_tool, int, int, int, timestamptz, timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function ai_credits_spend(uuid, ai_tool, int, int, int, timestamptz, timestamptz) from authenticated';
  end if;
end $$;

/*
 * AND THE ONE THAT WAS ALREADY OPEN. rate_limit_touch, from migration 0061,
 * is security definer and was left with the default PUBLIC execute. 0061
 * revoked the rate_limits TABLE from the api roles and then granted the
 * function, which left the brake itself in the hands of anyone holding the
 * anon key:
 *
 *   POST /rest/v1/rpc/rate_limit_touch
 *   {"p_bucket":"apply_email","p_subject":"victim@example.com","p_window_seconds":3600}
 *
 * Nine of those and that person cannot apply for a job for an hour. The same
 * trick locks a chosen address out of registering, or burns the credential
 * verification budget for an address the attacker picks.
 *
 * Only the service role needs it: every caller is a route holding the service
 * key.
 */
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rate_limit_touch') then
    execute 'revoke all on function rate_limit_touch(text, text, int) from public';
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute 'revoke all on function rate_limit_touch(text, text, int) from anon';
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute 'revoke all on function rate_limit_touch(text, text, int) from authenticated';
    end if;
  end if;
end $$;

-- ------------------------------------------------------------
-- 7 · The numbers, in one editable place
-- ------------------------------------------------------------

-- Merged rather than replaced, so a value already tuned in production is not
-- flattened by running this migration.
insert into app_settings (key, value) values ('elite', jsonb_build_object(
  -- Working days an employer has to answer a verified Elite applicant.
  'sla_days', 5,
  -- Default length of the early access window, in hours, offered in the UI.
  'early_access_hours', 72,
  -- No salary figure is published for a group smaller than this. Five is the
  -- floor that stops a benchmark from being a way to read one person's pay.
  'benchmark_min_group', 5,
  -- Credits per month and per day, by tier. The daily number exists only to
  -- stop a runaway client burning a month in an hour.
  'toolkit_credits', jsonb_build_object(
    'subscriber', jsonb_build_object('monthly', 30, 'daily', 8),
    'elite',      jsonb_build_object('monthly', 60, 'daily', 12)
  ),
  -- What each tool costs. Provisional: recompute from tokens_in and
  -- tokens_out in ai_runs once there is a month of data.
  'toolkit_weights', jsonb_build_object(
    'resume_review', 1,
    'skills_gap', 2,
    'interview_prep', 3
  )
))
on conflict (key) do update set value = excluded.value || app_settings.value;

-- ------------------------------------------------------------
-- 8 · Did it take
-- ------------------------------------------------------------

do $$
declare
  missing int;
begin
  select count(*) into missing from elite_memberships em
   where em.status = 'verified'
     and (em.public_slug is null or em.class_year is null
          or not exists (select 1 from elite_secrets s where s.talent_id = em.talent_id));
  if missing > 0 then
    raise exception '0064 did not take: % verified members have no slug, class or verification code.', missing;
  end if;

  -- A policy here would undo the reason this table exists.
  if exists (select 1 from pg_policies where tablename = 'elite_secrets') then
    raise exception '0064 refuses to finish: elite_secrets has a policy, which would expose verification codes to other members.';
  end if;

  -- And no form of these functions may take an argument, or they are an
  -- open membership oracle again.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('elite_verified', 'elite_chapter')
       and p.pronargs > 0
  ) then
    raise exception '0064 refuses to finish: elite_verified or elite_chapter still takes an argument, which makes it a membership oracle over the API.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_name = 'jobs' and column_name = 'elite_until') then
    raise exception '0064 did not take: jobs.elite_until is missing.';
  end if;

  if not exists (select 1 from pg_policies
                  where tablename = 'chapter_events' and policyname = 'chapter events read') then
    raise exception '0064 did not take: chapter_events has no read policy, which would leave it closed to everyone.';
  end if;

  raise notice '0064 applied. Early access is enforced in the policy, members have public proof and a verification code, chapters can hold events, Elite applications carry an answer deadline, referrals are attributed without money, and the toolkit has a budget.';
end $$;

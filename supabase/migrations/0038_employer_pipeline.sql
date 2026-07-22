-- ============================================================
-- MYJOBHACK App — Migration 0038 · Employer acquisition pipeline
--
-- The playbook says: 100 researched companies, a named human at each,
-- personalised outreach, two follow-ups then stop, and a quarterly list for
-- companies that hire often but aren't hiring today.
--
-- This makes the system enforce that discipline instead of relying on memory.
-- Deliberately a QUEUE, not an autoresponder: it tells you who is due and
-- pre-fills the template; you write the personal line and send.
-- Run after 0037.
-- ============================================================

create table if not exists employer_prospects (
  id uuid primary key default gen_random_uuid(),

  -- the company
  company text not null,
  sector text,
  city text,
  website text,
  tier int not null default 1,                -- 1 = BPO/fintech/retail etc, 4 = multinational
  size_band text,                             -- e.g. '50-200'

  -- the named human (never info@)
  contact_name text not null default '',
  contact_role text,                          -- HR Manager, TA Lead, Ops Manager...
  contact_email text,
  contact_phone text,
  linkedin_url text,

  -- what they hire
  hires_roles text,                           -- free text: "agents, team leads"
  hiring_now boolean not null default false,  -- decides which template applies

  -- pipeline
  stage text not null default 'to_contact',
  -- to_contact | contacted | follow_up_1 | follow_up_2 | replied | call_booked
  -- | proposal | won | not_now | lost
  next_action text,                           -- what to do next, in words
  next_action_at date,                        -- when it is due
  touches int not null default 0,             -- how many times we have emailed
  last_contacted_at timestamptz,
  quarterly_list boolean not null default false,  -- the "hires often, not now" nurture list

  -- outcome
  lost_reason text,
  owner_id uuid references profiles(id) on delete set null,
  linked_org_id uuid references orgs(id) on delete set null,  -- once they sign up

  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ep_stage_idx on employer_prospects (stage);
create index if not exists ep_due_idx on employer_prospects (next_action_at) where next_action_at is not null;
create index if not exists ep_quarterly_idx on employer_prospects (quarterly_list) where quarterly_list = true;
create unique index if not exists ep_email_idx on employer_prospects (lower(contact_email))
  where contact_email is not null;

-- Every touch is logged, so you can see the whole history and never double-send.
create table if not exists prospect_activity (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references employer_prospects(id) on delete cascade,
  kind text not null,              -- email | call | note | stage_change | reply
  subject text,
  body text,
  stage_from text,
  stage_to text,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pa_prospect_idx on prospect_activity (prospect_id, created_at desc);

alter table employer_prospects enable row level security;
alter table prospect_activity enable row level security;

drop policy if exists "prospects staff" on employer_prospects;
create policy "prospects staff" on employer_prospects
  for all using (is_staff() or is_admin_or_service())
  with check (is_staff() or is_admin_or_service());

drop policy if exists "prospect_activity staff" on prospect_activity;
create policy "prospect_activity staff" on prospect_activity
  for all using (is_staff() or is_admin_or_service())
  with check (is_staff() or is_admin_or_service());

-- Keep updated_at honest.
create or replace function touch_prospect() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_touch_prospect on employer_prospects;
create trigger trg_touch_prospect before update on employer_prospects
  for each row execute function touch_prospect();

-- Log every stage change automatically — the history writes itself.
create or replace function log_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into prospect_activity (prospect_id, kind, stage_from, stage_to)
    values (new.id, 'stage_change', old.stage, new.stage);
  end if;
  return new;
end $$;

drop trigger if exists trg_log_stage on employer_prospects;
create trigger trg_log_stage after update on employer_prospects
  for each row execute function log_stage_change();

notify pgrst, 'reload schema';

-- ============================================================
-- MYJOBHACK App — Migration 0019
--  1. Multi-location jobs (many states / countries per role)
--  2. Applicant marketing database (consent + reachable contacts)
-- Run in Supabase SQL Editor after 0018.
-- ============================================================

-- ---------- 1. MULTI-LOCATION ----------
-- Keep the existing free-text `location` for display, add structured coverage.
alter table jobs add column if not exists locations jsonb not null default '[]'::jsonb;
-- shape: [{"country":"Nigeria","state":"Lagos"}, {"country":"Ghana","state":"Greater Accra"}, {"country":"Nigeria","state":null}]
alter table jobs add column if not exists is_multi_location boolean not null default false;

comment on column jobs.locations is 'Structured coverage: array of {country, state|null}. state null = whole country.';

-- Fast filtering by country/state later
create index if not exists jobs_locations_gin on jobs using gin (locations);

-- ---------- 2. MARKETING DATABASE ----------
-- Everyone who applies becomes a reachable contact, with explicit consent.
create table if not exists marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null default '',
  source text not null default 'application',   -- application | signup | import | training
  profile_id uuid references profiles(id) on delete set null,
  consent boolean not null default true,        -- may we email campaigns?
  consent_source text,                          -- where consent was captured
  unsubscribed_at timestamptz,
  first_seen timestamptz not null default now(),
  last_activity timestamptz not null default now(),
  applied_job_ids uuid[] not null default '{}', -- which roles they've applied to
  tags text[] not null default '{}',            -- for segmenting campaigns
  unique (email)
);

create index if not exists mc_consent_idx on marketing_contacts (consent, unsubscribed_at);
create index if not exists mc_email_idx on marketing_contacts (lower(email));

alter table marketing_contacts enable row level security;
create policy "marketing staff all" on marketing_contacts
  for all using (is_staff()) with check (is_staff());

-- Upsert a contact whenever someone applies. Called from the apply routes.
create or replace function upsert_marketing_contact(
  p_email text, p_name text, p_source text, p_job_id uuid, p_profile uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into marketing_contacts (email, full_name, source, profile_id, applied_job_ids, consent_source)
  values (lower(p_email), coalesce(p_name,''), p_source, p_profile,
          case when p_job_id is null then '{}'::uuid[] else array[p_job_id] end,
          'Job application on MYJOBHACK')
  on conflict (email) do update set
    full_name = case when marketing_contacts.full_name = '' then excluded.full_name else marketing_contacts.full_name end,
    profile_id = coalesce(marketing_contacts.profile_id, excluded.profile_id),
    last_activity = now(),
    applied_job_ids = (
      select array(select distinct unnest(marketing_contacts.applied_job_ids || excluded.applied_job_ids))
    );
end $$;

-- Backfill from existing applications (both member and guest).
insert into marketing_contacts (email, full_name, source, profile_id, applied_job_ids, consent_source)
select lower(a.email), coalesce(max(a.full_name), ''), 'application', null,
       array_agg(distinct a.job_id), 'Backfilled from prior applications'
from (
  select job_id, guest_email as email, guest_name as full_name from applications where guest_email is not null
  union all
  select ap.job_id, p.email, p.full_name
  from applications ap join profiles p on p.id = ap.talent_id
  where ap.talent_id is not null
) a
where a.email is not null and a.email <> ''
group by lower(a.email)
on conflict (email) do nothing;

notify pgrst, 'reload schema';

-- ---------- FUNNEL END STATE ----------
-- Mark users the funnel has exhausted, so it stops nudging them.
alter table profiles add column if not exists funnel_status text not null default 'active';
-- 'active' | 'dormant' | 'converted'
create index if not exists profiles_funnel_status_idx on profiles (funnel_status);

notify pgrst, 'reload schema';

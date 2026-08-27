-- ============================================================
-- MYJOBHACK App — Migration 0025 · AI Matching + Revenue Rails
-- Run after 0024.
-- ============================================================

-- ---------- 1. JOB ↔ CANDIDATE MATCHING ----------
-- Cached match scores so we don't recompute on every page load.
create table if not exists job_matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  talent_id uuid not null references profiles(id) on delete cascade,
  score numeric not null default 0,          -- 0..100 fit
  reasons text[] not null default '{}',       -- why it matched
  competency_fit boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (job_id, talent_id)
);
create index if not exists jm_talent_idx on job_matches (talent_id, score desc);
create index if not exists jm_job_idx on job_matches (job_id, score desc);
alter table job_matches enable row level security;
create policy "matches own or staff" on job_matches
  for select using (talent_id = auth.uid() or is_staff());
create policy "matches write staff" on job_matches
  for all using (is_staff()) with check (is_staff());

-- ---------- 2. EMPLOYER ACCESS (revenue rail) ----------
-- Employer subscription tiers for pool access.
create table if not exists employer_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_ngn numeric not null default 0,
  price_usd numeric not null default 0,
  interval text not null default 'monthly',
  profile_views_per_month int,               -- null = unlimited
  can_search_pool boolean not null default false,
  can_contact boolean not null default false,
  can_request_assessment boolean not null default false,
  featured_job_slots int not null default 0,
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists employer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid references employer_plans(id),
  status text not null default 'active',      -- active | past_due | cancelled
  period_start date not null default current_date,
  period_end date,
  views_used int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists esub_profile_idx on employer_subscriptions (profile_id, status);

-- Log of which candidate profiles an employer has unlocked/viewed (metering).
create table if not exists profile_unlocks (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references profiles(id) on delete cascade,
  talent_id uuid not null references profiles(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (employer_id, talent_id)
);

-- Paid per-role assessment requests (employer funds candidate assessment).
create table if not exists assessment_orders (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references profiles(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  talent_ids uuid[] not null default '{}',
  amount numeric not null default 0,
  currency text not null default 'NGN',
  status text not null default 'pending',     -- pending | paid | fulfilled
  created_at timestamptz not null default now()
);

alter table employer_plans enable row level security;
alter table employer_subscriptions enable row level security;
alter table profile_unlocks enable row level security;
alter table assessment_orders enable row level security;
create policy "eplans public read" on employer_plans for select using (true);
create policy "eplans staff write" on employer_plans for all using (is_staff()) with check (is_staff());
create policy "esub own or staff" on employer_subscriptions for all using (profile_id = auth.uid() or is_staff()) with check (profile_id = auth.uid() or is_staff());
create policy "unlocks own or staff" on profile_unlocks for all using (employer_id = auth.uid() or is_staff()) with check (employer_id = auth.uid() or is_staff());
create policy "orders own or staff" on assessment_orders for all using (employer_id = auth.uid() or is_staff()) with check (employer_id = auth.uid() or is_staff());

-- ---------- 3. ELITE PERKS ----------
alter table elite_memberships add column if not exists tier text default 'standard'; -- standard | premium
alter table elite_memberships add column if not exists perks jsonb not null default '{}'::jsonb;

-- Seed employer plans
insert into employer_plans (name, price_ngn, price_usd, profile_views_per_month, can_search_pool, can_contact, can_request_assessment, featured_job_slots, sort)
values
  ('Starter', 0, 0, 5, false, false, false, 0, 0),
  ('Growth', 45000, 30, 50, true, true, false, 1, 1),
  ('Scale', 150000, 100, null, true, true, true, 5, 2)
on conflict do nothing;

notify pgrst, 'reload schema';

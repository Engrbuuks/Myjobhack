-- ============================================================
-- MYJOBHACK App — Migration 0006 · Growth pack
-- Run in Supabase SQL Editor after 0005.
-- Per-tool AI plans · training curation fields · invoices
-- ============================================================

-- 1) AI tools billable separately or as combo
--    tools = NULL means the plan unlocks EVERYTHING (the combo).
alter table plans add column if not exists tools text[] default null;
alter table plans add column if not exists sort int not null default 0;

update plans set sort = 10 where tools is null;

insert into plans (name, price_ngn, price_usd, interval, features, active, tools, sort)
values
  ('AI Resume Review', 2000, 4, 'monthly',
   '["Loophole-hunting resume review","Severity-ranked fixes","Unlimited runs for 30 days"]'::jsonb,
   true, array['resume-review'], 1),
  ('AI Interview Preparer', 2000, 4, 'monthly',
   '["Interview prep built from YOUR resume","Intro script + likely questions","Questions to ask them"]'::jsonb,
   true, array['interview-prep'], 2),
  ('AI Skills Gap Analysis', 2000, 4, 'monthly',
   '["Profile + resume vs market demand","Priority gaps identified","6-month upskilling plan"]'::jsonb,
   true, array['skills-gap'], 3)
on conflict do nothing;

-- track which plan a subscription came from is already there (plan_id)

-- 2) Training curation
alter table trainings add column if not exists format text not null default 'virtual';   -- lms | virtual | physical
alter table trainings add column if not exists topic text not null default '';
alter table trainings add column if not exists expectations text not null default '';
alter table trainings add column if not exists about text not null default '';
alter table trainings add column if not exists facilitator_name text not null default '';
alter table trainings add column if not exists thumbnail_document_id uuid references documents(id);

-- 3) Invoices (employer requests → billed services)
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  client_name text not null,
  client_email text not null,
  org_id uuid references organizations(id),
  currency text not null default 'NGN',
  items jsonb not null default '[]'::jsonb,     -- [{description, qty, amount}]
  total numeric not null default 0,
  status text not null default 'draft',          -- draft | sent | paid | void
  notes text default '',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz
);
alter table invoices enable row level security;
create policy "invoices staff all" on invoices
  for all using (is_staff()) with check (is_staff());

-- 4) payments know which plan they buy (per-tool billing)
alter table payments add column if not exists plan_id uuid references plans(id);

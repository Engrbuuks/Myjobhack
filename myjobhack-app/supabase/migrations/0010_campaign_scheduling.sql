-- ============================================================
-- MYJOBHACK App — Migration 0010 · Campaign scheduling + history
-- Run in Supabase SQL Editor after 0009.
-- ============================================================

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id),
  subject text not null,
  draft jsonb not null,                   -- the full inverted-pyramid draft
  audience text not null,                 -- all_talent | elite | niche | list
  niche_id uuid references taxonomies(id),
  email_list text,
  status text not null default 'scheduled',  -- scheduled | sending | sent | cancelled | failed
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipients int not null default 0,
  sent_count int not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists campaigns_due_idx on campaigns (status, scheduled_at);

alter table campaigns enable row level security;
create policy "campaigns staff" on campaigns
  for all using (is_staff()) with check (is_staff());

-- ============================================================
-- MYJOBHACK App — Migration 0011 · Public trainings + interest capture
-- Run in Supabase SQL Editor after 0010.
-- ============================================================

-- Which trainings the world may see (default: yes for open ones you publish)
alter table trainings add column if not exists is_public boolean not null default false;
create index if not exists trainings_public_idx on trainings (is_public, status);

-- People who express interest without an account — feeds the funnel
create table if not exists training_interest (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  country text,
  message text,
  created_at timestamptz not null default now(),
  unique (training_id, email)
);
alter table training_interest enable row level security;
create policy "interest staff" on training_interest
  for all using (is_staff()) with check (is_staff());

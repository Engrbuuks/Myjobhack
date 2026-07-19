-- ============================================================
-- MYJOBHACK App — Migration 0013 · Key requirements, homepage control, deadlines
-- Run in Supabase SQL Editor after 0012.
-- ============================================================

-- Key requirements: the non-negotiables, shown prominently on the card and page
alter table jobs add column if not exists key_requirements text[] not null default '{}';

-- Homepage curation: which roles appear on the website's front page
alter table jobs add column if not exists is_featured boolean not null default false;
alter table jobs add column if not exists featured_rank int;

create index if not exists jobs_featured_idx on jobs (is_featured, featured_rank)
  where status = 'published';

-- closes_at already exists (0001) — index it for the expiry filter
create index if not exists jobs_closes_at_idx on jobs (closes_at)
  where status = 'published';

-- Auto-close roles whose deadline has passed. Reversible: clear or extend
-- closes_at in the editor and the role returns to the listings immediately.
create or replace function job_is_open(j jobs)
returns boolean language sql stable as $$
  select j.status = 'published' and (j.closes_at is null or j.closes_at > now());
$$;

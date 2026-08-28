-- 0048 · Market skill benchmarks.
--
-- THE COLD-START PROBLEM: measuring the pool against employer demand only
-- works once employers are posting. Before that, the demand side is empty and
-- the pool's deficiencies are invisible — exactly when knowing them matters
-- most, because training takes months to run.
--
-- So the benchmark is fetched from the live web instead: what roles in this
-- market currently require, pulled through a search-grounded model, WITH the
-- source pages stored alongside. Sources are the point. A skills list nobody
-- can check is an opinion; one that cites where each claim came from can be
-- audited, corrected and defended to a client.
--
-- Every row is reviewable and editable. Nothing generated is treated as fact
-- until a human approves it, and manual rows always outrank fetched ones.

create table if not exists skill_benchmarks (
  id uuid primary key default gen_random_uuid(),

  niche_id uuid references taxonomies(id) on delete cascade,
  niche_label text not null default '',       -- kept for display if taxonomy changes
  role_level text,                            -- entry | mid | senior, null = all
  region text not null default 'Nigeria',

  skill text not null,
  importance text not null default 'important',  -- core | important | nice
  why text not null default '',                  -- why the market asks for it

  -- Where this came from and whether it can be trusted yet.
  source text not null default 'web',            -- web | manual | employer
  sources jsonb not null default '[]'::jsonb,    -- [{title, uri}]
  approved boolean not null default false,
  approved_by uuid references profiles(id),
  approved_at timestamptz,

  generated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

-- One row per skill per niche/level/region; refetching updates rather than
-- piling up duplicates.
create unique index if not exists skill_benchmarks_uniq
  on skill_benchmarks (coalesce(niche_id::text, ''), coalesce(role_level, ''), region, lower(skill));

create index if not exists skill_benchmarks_niche_idx on skill_benchmarks(niche_id);

alter table skill_benchmarks enable row level security;

drop policy if exists "skill_benchmarks staff" on skill_benchmarks;
create policy "skill_benchmarks staff" on skill_benchmarks
  for all using (
    exists (select 1 from profiles p
            where p.id = auth.uid() and p.role in ('admin','recruiter'))
  );

comment on table skill_benchmarks is
  'What the market currently requires per niche, fetched with web grounding or entered by hand. Measured against indexed CV text to find pool deficiencies before employer demand exists.';

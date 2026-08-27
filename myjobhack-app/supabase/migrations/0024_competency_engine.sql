-- ============================================================
-- MYJOBHACK App — Migration 0024 · Competency Assessment Engine
-- The foundation of the competency-verification strategy.
-- Run after 0023.
-- ============================================================

-- An assessment is generated for a candidate based on their field/title/level.
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references profiles(id) on delete cascade,
  niche_id uuid references taxonomies(id),
  field_label text not null,               -- the title/field this tests (snapshot)
  role_level role_level,                    -- seniority at time of test
  status text not null default 'generated', -- generated | in_progress | submitted | scored | expired
  generated_by text,                        -- ai model used to generate
  questions jsonb not null default '[]'::jsonb,
  -- [{id, type: 'mcq'|'open'|'code', prompt, options?, rubric, max_points, minutes}]
  time_limit_min int not null default 45,
  started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists asmt_talent_idx on assessments (talent_id, created_at desc);
create index if not exists asmt_status_idx on assessments (status);

-- Candidate answers.
create table if not exists assessment_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  question_id text not null,
  answer text not null default '',
  seconds_spent int,                        -- anti-cheat: time on this question
  created_at timestamptz not null default now(),
  unique (assessment_id, question_id)
);

-- Scores. One row per assessment once graded.
create table if not exists assessment_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique references assessments(id) on delete cascade,
  talent_id uuid not null references profiles(id) on delete cascade,
  overall numeric not null default 0,        -- 0..100
  percentile int,                            -- vs same field/level cohort
  band text not null default 'developing',   -- developing | proficient | strong | expert
  per_question jsonb not null default '[]'::jsonb, -- [{question_id, points, max, note}]
  strengths text[],
  gaps text[],                               -- feeds the toolkit/training
  ai_confidence numeric,                     -- 0..1; low → human review
  scored_by text,                            -- ai model
  review_status text not null default 'auto', -- auto | needs_review | confirmed | overridden
  reviewer_id uuid references profiles(id),
  reviewer_note text,
  flags text[],                              -- anti-cheat flags
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists ascore_talent_idx on assessment_scores (talent_id);
create index if not exists ascore_review_idx on assessment_scores (review_status);

-- The public-facing competency badge shown on a profile (best/latest per field).
alter table talent_profiles add column if not exists competency_band text;   -- developing|proficient|strong|expert
alter table talent_profiles add column if not exists competency_score numeric;
alter table talent_profiles add column if not exists competency_percentile int;
alter table talent_profiles add column if not exists competency_field text;
alter table talent_profiles add column if not exists competency_assessed_at timestamptz;

-- RLS
alter table assessments enable row level security;
alter table assessment_answers enable row level security;
alter table assessment_scores enable row level security;

create policy "asmt own or staff" on assessments
  for all using (talent_id = auth.uid() or is_staff()) with check (talent_id = auth.uid() or is_staff());
create policy "ans own or staff" on assessment_answers
  for all using (
    exists (select 1 from assessments a where a.id = assessment_id and (a.talent_id = auth.uid() or is_staff()))
  ) with check (
    exists (select 1 from assessments a where a.id = assessment_id and (a.talent_id = auth.uid() or is_staff()))
  );
-- Candidates can read their own score; only staff can write/override.
create policy "score read own or staff" on assessment_scores
  for select using (talent_id = auth.uid() or is_staff());
create policy "score write staff" on assessment_scores
  for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';

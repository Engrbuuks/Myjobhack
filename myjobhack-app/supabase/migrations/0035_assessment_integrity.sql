-- ============================================================
-- MYJOBHACK App — Migration 0035 · Assessment integrity & depth
--
-- 1. Question bank per assessment gets a variant seed so no two candidates
--    in the same field receive identical papers.
-- 2. Integrity signals captured per assessment (timing, paste, focus loss)
--    so AI-assisted answers can be flagged for human review.
-- 3. Question count becomes variable by seniority.
-- Run after 0034.
-- ============================================================

-- Variant tracking: which "form" of the paper a candidate received.
alter table assessments add column if not exists variant_seed text;
alter table assessments add column if not exists question_count int;
alter table assessments add column if not exists difficulty text;   -- entry|mid|senior|expert

-- Integrity signals captured client-side during the sitting.
alter table assessments add column if not exists integrity jsonb not null default '{}'::jsonb;
-- shape: { paste_events, focus_losses, total_seconds, suspicious_speed:[qid],
--          typing_bursts, flags:[...], risk: 'low'|'medium'|'high' }

alter table assessment_scores add column if not exists integrity_risk text default 'low';

-- Index so the review queue can filter on risk quickly.
create index if not exists asmt_integrity_idx on assessments ((integrity->>'risk'));

-- Fingerprint of every question ever issued to a candidate, so the generator
-- can avoid repeating the same prompt to the same person on a retake.
create table if not exists issued_questions (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references profiles(id) on delete cascade,
  prompt_hash text not null,
  field_label text,
  created_at timestamptz not null default now()
);
create index if not exists issued_q_talent_idx on issued_questions (talent_id, created_at desc);

alter table issued_questions enable row level security;
drop policy if exists "issued_q staff" on issued_questions;
create policy "issued_q staff" on issued_questions
  for all using (is_staff()) with check (is_staff());

notify pgrst, 'reload schema';

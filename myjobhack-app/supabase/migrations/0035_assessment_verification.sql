-- ============================================================
-- MYJOBHACK App — Migration 0035 · Assessment integrity & live verification
--
-- We cannot PREVENT a candidate using an AI chatbot on a second device.
-- The strongest real defence is a short live verification: ask the candidate
-- to explain their own answer. Someone who cheated cannot. This records that
-- process so a verified band is visibly stronger than an unverified one.
--
-- Run after 0034.
-- ============================================================

-- Outcome of a live verification call on a specific assessment.
alter table assessment_scores add column if not exists verification_status text
  not null default 'not_required';   -- not_required | requested | passed | failed
alter table assessment_scores add column if not exists verified_by uuid references profiles(id) on delete set null;
alter table assessment_scores add column if not exists verified_at timestamptz;
alter table assessment_scores add column if not exists verification_notes text;

create index if not exists ascore_verification_idx on assessment_scores (verification_status);

-- Any high-risk sitting should be picked up for verification automatically.
create or replace function flag_for_verification() returns trigger
language plpgsql as $$
begin
  if new.integrity_risk = 'high' and new.verification_status = 'not_required' then
    new.verification_status := 'requested';
  end if;
  return new;
end $$;

drop trigger if exists trg_flag_verification on assessment_scores;
create trigger trg_flag_verification before insert or update on assessment_scores
  for each row execute function flag_for_verification();

notify pgrst, 'reload schema';

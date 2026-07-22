-- ============================================================
-- MYJOBHACK App — Migration 0031 · Paystack automation support
-- Columns the settlement dispatcher writes to. Run after 0030.
-- ============================================================

-- profile_unlocks: remember the paid reference
alter table profile_unlocks add column if not exists paid_ref text;
-- allow upsert on (employer_id, talent_id)
do $$ begin
  alter table profile_unlocks add constraint profile_unlocks_emp_talent_key unique (employer_id, talent_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

-- payments: provider ref + meta (if not already present)
alter table payments add column if not exists provider_ref text;
alter table payments add column if not exists purpose text;
alter table payments add column if not exists meta jsonb not null default '{}'::jsonb;
create index if not exists payments_ref_idx on payments (provider_ref);

-- elite premium flags
alter table elite_memberships add column if not exists premium_active boolean not null default false;
alter table elite_memberships add column if not exists premium_since timestamptz;

notify pgrst, 'reload schema';

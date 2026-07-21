-- ============================================================
-- MYJOBHACK App — Migration 0028 · Elite economics
--  • placement fees (% for Elite, flat for general) recorded on hire
--  • premium unlock pricing for Elite talent
--  • capped free assessments for Elite members
-- Run after 0027.
-- ============================================================

-- Placement records — one per hire made through the platform.
create table if not exists placements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id) on delete set null,
  employer_id uuid references profiles(id) on delete set null,
  talent_id uuid references profiles(id) on delete set null,
  is_elite boolean not null default false,
  salary_monthly numeric,               -- captured at hire for % fee
  fee_type text not null default 'flat',-- flat | percent
  fee_amount numeric not null default 0,-- computed fee in NGN
  currency text not null default 'NGN',
  status text not null default 'pending', -- pending | invoiced | paid | waived
  invoice_id uuid references invoices(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists placements_employer_idx on placements (employer_id, created_at desc);
alter table placements enable row level security;
create policy "placements own or staff" on placements
  for all using (employer_id = auth.uid() or is_staff()) with check (employer_id = auth.uid() or is_staff());

-- Track how many free assessments an Elite member has consumed (for the cap).
alter table talent_profiles add column if not exists free_assessments_used int not null default 0;

notify pgrst, 'reload schema';

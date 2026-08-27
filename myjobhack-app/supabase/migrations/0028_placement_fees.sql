-- ============================================================
-- MYJOBHACK App — Migration 0028 · Placement fees + Elite economics
-- Money flows from employers, higher for Elite talent.
-- Run after 0027.
-- ============================================================

-- Placements: recorded when an employer hires through the platform.
create table if not exists placements (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references profiles(id) on delete cascade,
  talent_id uuid not null references profiles(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  is_elite boolean not null default false,
  monthly_salary numeric,               -- basis for the % fee (Elite)
  fee_amount numeric not null default 0, -- computed placement fee
  fee_basis text not null default 'flat', -- 'flat' | 'percent'
  currency text not null default 'NGN',
  status text not null default 'pending', -- pending | invoiced | paid
  invoice_id uuid references invoices(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists placements_emp_idx on placements (employer_id, created_at desc);
alter table placements enable row level security;
drop policy if exists "placements own or staff" on placements;
create policy "placements own or staff" on placements
  for all using (employer_id = auth.uid() or is_staff()) with check (employer_id = auth.uid() or is_staff());

-- Elite assessment cap tracking (so unlimited free assessments can't drain margin).
alter table elite_memberships add column if not exists assessments_used int not null default 0;
alter table talent_profiles add column if not exists free_assessments_used int not null default 0;

-- Seed placement + elite pricing into the central pricing settings.
insert into app_settings (key, value) values
  ('pricing', jsonb_build_object(
    'placement_general_ngn', 25000,            -- general hire, flat
    'placement_elite_percent', 10,          -- Elite hire, % of monthly salary
    'elite_unlock_premium_ngn', 5000,   -- Elite profile unlock costs 3x views
    'elite_free_assessments', 3             -- cap on free assessments for Elite
  ))
on conflict (key) do update set value = app_settings.value || excluded.value;

notify pgrst, 'reload schema';

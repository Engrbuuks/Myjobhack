-- ============================================================
-- MYJOBHACK App — Migration 0012 · Currency on jobs & invoices
-- Run in Supabase SQL Editor after 0011.
-- ============================================================

-- Jobs carry their own currency so salary figures always display a symbol
alter table jobs add column if not exists salary_currency text not null default 'NGN';

-- Backfill: infer from any symbol already typed into the free-text note
update jobs set salary_currency = 'USD'
  where salary_note like '%$%' and salary_currency = 'NGN';
update jobs set salary_currency = 'GBP'
  where salary_note like '%£%' and salary_currency = 'NGN';

-- Invoices likewise (guard: table added in 0006)
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'invoices') then
    alter table invoices add column if not exists currency text not null default 'NGN';
  end if;
end $$;

-- ============================================================
-- MYJOBHACK App — Migration 0005 · Training pricing + payment kinds
-- Run in Supabase SQL Editor after 0004.
-- ============================================================

alter table trainings add column if not exists price_ngn integer not null default 0;
alter table trainings add column if not exists price_usd integer not null default 0;

alter table payments add column if not exists training_id uuid references trainings(id);
alter table payments add column if not exists kind text not null default 'subscription';

create index if not exists payments_training_idx on payments(training_id);

-- ============================================================
-- MYJOBHACK App — Migration 0008 · Guest applications + de-AI naming
-- Run in Supabase SQL Editor after 0007.
-- ============================================================

-- Guests can apply without an account
alter table applications alter column talent_id drop not null;
alter table applications
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists guest_phone text,
  add column if not exists guest_resume_path text;
create index if not exists applications_guest_email_idx on applications(guest_email);

-- Strip "AI" from plan names (the tools stay smart; the branding goes quiet)
update plans set name = replace(name, 'AI ', '') where name like 'AI %';
update plans set name = 'Career Toolkit' where tools is null and name ilike '%toolkit%';

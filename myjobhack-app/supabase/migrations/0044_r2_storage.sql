-- ============================================================
-- MYJOBHACK App — Migration 0044 · Cloudflare R2 storage
--
-- Files move to R2 so Supabase storage stays small and cheap. Existing files
-- stay where they are — every row records its own provider, so reads work
-- during and after migration without a big-bang cutover.
-- Run after 0043.
-- ============================================================

-- Where each file actually lives. Anything unmarked is Supabase (the default),
-- so existing rows keep working untouched.
alter table documents add column if not exists storage_provider text not null default 'supabase';
create index if not exists documents_provider_idx on documents (storage_provider);

alter table applications add column if not exists guest_resume_provider text not null default 'supabase';

-- Track uploads for quota and cost visibility.
create table if not exists upload_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete set null,
  bucket text not null,
  path text not null,
  kind text not null,                -- resume | guest_resume | logo | course_asset | proof
  bytes bigint not null default 0,
  storage_provider text not null default 'supabase',
  created_at timestamptz not null default now()
);
create index if not exists upload_log_profile_idx on upload_log (profile_id);
create index if not exists upload_log_provider_idx on upload_log (storage_provider);

alter table upload_log enable row level security;
drop policy if exists "upload_log own or staff" on upload_log;
create policy "upload_log own or staff" on upload_log
  for all using (profile_id = auth.uid() or is_staff() or is_admin_or_service())
  with check (profile_id = auth.uid() or is_staff() or is_admin_or_service());

notify pgrst, 'reload schema';

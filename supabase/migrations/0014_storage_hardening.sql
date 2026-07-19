-- ============================================================
-- MYJOBHACK App — Migration 0014 · Storage hardening & quotas
-- Run in Supabase SQL Editor after 0013.
-- ============================================================

-- Dedicated bucket for guest (no-account) applications, kept apart from
-- member documents so retention and access rules can differ.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('guest-uploads','guest-uploads', false, 10485760,
   array['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Size + type ceilings on the existing buckets
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png','image/jpeg','image/webp']
  where id = 'documents';

update storage.buckets set file_size_limit = 2097152,
  allowed_mime_types = array['image/png','image/jpeg','image/webp']
  where id = 'avatars';

update storage.buckets set file_size_limit = 209715200 where id = 'course-assets';

-- Staff-only access to guest uploads
drop policy if exists "guest uploads staff read" on storage.objects;
create policy "guest uploads staff read" on storage.objects for select
  using (bucket_id = 'guest-uploads' and is_staff());
drop policy if exists "guest uploads staff delete" on storage.objects;
create policy "guest uploads staff delete" on storage.objects for delete
  using (bucket_id = 'guest-uploads' and is_admin());

-- Storage ledger: what was uploaded, by whom, how big — for quotas and cleanup
create table if not exists storage_objects_log (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  profile_id uuid references profiles(id) on delete set null,
  kind text,                       -- resume | avatar | course_asset | guest_resume | training_thumb
  bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists sol_profile_idx on storage_objects_log (profile_id, created_at desc);
create index if not exists sol_bucket_idx on storage_objects_log (bucket, created_at desc);
alter table storage_objects_log enable row level security;
create policy "storage log own" on storage_objects_log
  for select using (profile_id = auth.uid() or is_staff());
create policy "storage log insert" on storage_objects_log
  for insert with check (true);
create policy "storage log staff" on storage_objects_log
  for all using (is_staff()) with check (is_staff());

-- Per-profile usage, used to enforce fair-use limits
create or replace function storage_used_bytes(p uuid)
returns bigint language sql stable as $$
  select coalesce(sum(bytes), 0) from storage_objects_log where profile_id = p;
$$;

-- Default quota (bytes) — overridable per plan in app_settings
insert into app_settings (key, value) values
  ('storage_quota', '{"job_seeker": 26214400, "elite_member": 104857600, "employer": 524288000, "trainer": 1073741824}'::jsonb)
on conflict (key) do nothing;


-- Guest resumes now live in their own bucket; record which one per application
alter table applications add column if not exists guest_resume_bucket text default 'documents';
update applications set guest_resume_bucket = 'documents' where guest_resume_bucket is null;

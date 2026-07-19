-- ============================================================
-- MYJOBHACK App — Migration 0015 · Company identity on jobs
-- Run in Supabase SQL Editor after 0014.
-- ============================================================

-- Public company logos (safe to serve directly — no signed URL needed)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('company-logos','company-logos', true, 2097152,
   array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "logos public read" on storage.objects;
create policy "logos public read" on storage.objects for select
  using (bucket_id = 'company-logos');
drop policy if exists "logos member write" on storage.objects;
create policy "logos member write" on storage.objects for insert
  with check (bucket_id = 'company-logos' and auth.uid() is not null);
drop policy if exists "logos member update" on storage.objects;
create policy "logos member update" on storage.objects for update
  using (bucket_id = 'company-logos' and auth.uid() is not null);

-- Direct logo path on the organisation (simpler than the documents indirection)
alter table organizations add column if not exists logo_path text;

-- Roles posted by staff on behalf of a client can name the employer directly,
-- without that company having an account yet.
alter table jobs add column if not exists company_name text;
alter table jobs add column if not exists company_logo_path text;
alter table jobs add column if not exists company_website text;

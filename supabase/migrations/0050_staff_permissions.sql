-- 0050 · Graded staff access.
--
-- Until now "admin" was all-or-nothing: anyone who could review applicants
-- could also change pricing, issue refunds, delete accounts and promote other
-- admins. That forces an unhappy choice — hand a coordinator the keys to
-- everything, or do their work yourself.
--
-- Permissions are stored per profile as a list of capability strings. A NULL
-- list means "no restriction", so every existing admin keeps exactly the
-- access they have today and nothing breaks on deploy. Restrictions only
-- begin once someone is explicitly given a list.

alter table profiles
  add column if not exists permissions text[],
  add column if not exists invited_by uuid references profiles(id),
  add column if not exists invited_at timestamptz,
  add column if not exists access_note text;

comment on column profiles.permissions is
  'Capability strings (see lib/permissions.ts). NULL = unrestricted for the role. An empty array means no staff capabilities at all.';

-- ---------- Server-side checks ----------
--
-- These exist so RLS policies and SQL can ask the same question the
-- application asks. A permission enforced only in the UI is decoration:
-- the API route is what actually protects the data.

create or replace function has_permission(uid uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = uid
      and p.role in ('admin','recruiter')
      -- NULL permissions = unrestricted, which is what every current admin has.
      and (p.permissions is null or perm = any(p.permissions))
  );
$$;

create or replace function is_unrestricted_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = uid and p.role = 'admin' and p.permissions is null
  );
$$;

-- ---------- Audit ----------
--
-- Granting access is exactly the action worth being able to reconstruct later.

create table if not exists access_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  target_id uuid references profiles(id) on delete set null,
  action text not null,                    -- created | role_changed | permissions_changed | deleted
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists access_log_created_idx on access_log(created_at desc);
create index if not exists access_log_target_idx on access_log(target_id);

alter table access_log enable row level security;

drop policy if exists "access_log admins" on access_log;
create policy "access_log admins" on access_log
  for all using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

comment on table access_log is
  'Who created, promoted, restricted or removed which account, and when.';

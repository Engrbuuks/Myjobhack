-- ============================================================
-- MYJOBHACK App — Migration 0029 · Invite links
-- Unique shareable links that pre-set the registration type
-- (Elite member or employer) and track signups per link.
-- Run after 0028.
-- ============================================================

create table if not exists invite_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- the slug in the URL
  label text,                              -- internal name, e.g. "LinkedIn campaign"
  kind text not null default 'talent',     -- 'talent' | 'elite' | 'employer'
  created_by uuid references profiles(id) on delete set null,
  signups int not null default 0,          -- how many registered via this link
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists invite_links_code_idx on invite_links (code);

alter table invite_links enable row level security;
drop policy if exists "invite_links staff" on invite_links;
create policy "invite_links staff" on invite_links
  for all using (is_staff()) with check (is_staff());

-- Public can READ an active link (to resolve kind at signup) — but only active ones.
drop policy if exists "invite_links public read" on invite_links;
create policy "invite_links public read" on invite_links
  for select using (active = true);

-- Increment signups counter (called from the register flow).
create or replace function bump_invite_signup(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update invite_links set signups = signups + 1 where code = p_code and active = true;
end $$;

notify pgrst, 'reload schema';

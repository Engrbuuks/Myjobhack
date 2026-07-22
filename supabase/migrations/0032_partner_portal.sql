-- ============================================================
-- MYJOBHACK App — Migration 0032 · Partner portal
-- Partners refer talent/employers via their own invite links and can see
-- which opportunities are open to promote. Built on invite_links (already
-- tracks signups per link) rather than a speculative new referral system.
-- Run after 0031.
-- ============================================================

-- Let a partner own invite links (so they see only their own referrals).
alter table invite_links add column if not exists partner_id uuid references profiles(id) on delete set null;
create index if not exists invite_links_partner_idx on invite_links (partner_id);

-- Partners can read + create their own links.
drop policy if exists "invite_links partner own" on invite_links;
create policy "invite_links partner own" on invite_links
  for select using (partner_id = auth.uid() or is_staff());

notify pgrst, 'reload schema';

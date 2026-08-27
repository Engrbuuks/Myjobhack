-- ============================================================
-- MYJOBHACK App — Migration 0041 · Invite applicants into the pool
--
-- People who apply to a job without an account are the warmest supply we
-- will ever touch: they want work now and have already engaged. Today they
-- apply and disappear. This tracks inviting them to join properly.
-- Run after 0040.
-- ============================================================

-- Track the invitation so nobody is asked twice.
alter table applications add column if not exists pool_invited_at timestamptz;
alter table applications add column if not exists pool_joined boolean not null default false;
create index if not exists apps_pool_invite_idx on applications (guest_email)
  where guest_email is not null and pool_invited_at is null;

-- Settings for the invite behaviour.
insert into app_settings (key, value) values
  ('applicant_invites', jsonb_build_object(
    'enabled', true,
    'delay_hours', 24,        -- wait a day so it doesn't collide with the application receipt
    'max_per_run', 100
  ))
on conflict (key) do update set value = app_settings.value || excluded.value;

notify pgrst, 'reload schema';

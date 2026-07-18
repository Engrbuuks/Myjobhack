-- ============================================================
-- MYJOBHACK App — Migration 0009 · Toolkit fair-use limits
-- Run in Supabase SQL Editor after 0008.
-- ============================================================

insert into app_settings (key, value) values
  ('toolkit_limits', '{"resume-review": 5, "interview-prep": 1, "skills-gap": 3}'::jsonb)
on conflict (key) do nothing;

create index if not exists ai_runs_usage_idx on ai_runs (profile_id, tool, created_at);

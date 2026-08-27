-- ============================================================
-- MYJOBHACK App — Migration 0026 · Centralised pricing
-- Move hardcoded prices into app_settings so they're editable in one place.
-- Run after 0025.
-- ============================================================

insert into app_settings (key, value) values
  ('pricing', jsonb_build_object(
    'assessment_per_candidate_ngn', 3500,
    'assessment_per_candidate_usd', 3,
    'elite_premium_ngn', 5000,
    'elite_premium_usd', 4
  ))
on conflict (key) do update set value =
  app_settings.value || excluded.value;   -- merge, don't clobber existing keys

notify pgrst, 'reload schema';

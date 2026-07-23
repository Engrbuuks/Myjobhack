-- ============================================================
-- MYJOBHACK App — Migration 0043 · Interview booking defaults
--
-- Interviews already support two modes: a fixed date you set, or a booking
-- link the candidate picks from. What was missing is somewhere to SAVE the
-- booking link, so it had to be pasted every time.
-- Run after 0042.
-- ============================================================

insert into app_settings (key, value) values
  ('interviews', jsonb_build_object(
    'booking_url', '',            -- e.g. https://calendly.com/yourjobhacks/30min
    'default_mode', 'video',
    'default_duration_min', 30,
    'default_meeting_link', ''    -- a standing Zoom room, if you use one
  ))
on conflict (key) do update set value = app_settings.value || excluded.value;

notify pgrst, 'reload schema';

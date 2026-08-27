-- ============================================================
-- MYJOBHACK App — Migration 0042 · Campaign pacing
--
-- Campaigns now trickle rather than blast. Sending 200 identical emails in one
-- burst is a recognisable bulk pattern; spacing them out stays inside provider
-- rate limits, looks less like a blast to spam filters, and — most usefully —
-- means a bad send can be stopped part-way instead of after all of them left.
--
-- Honest note: pacing does NOT reliably move mail from Promotions to Primary.
-- That is decided by content design and engagement history, not send timing.
-- Run after 0041.
-- ============================================================

insert into app_settings (key, value) values
  ('campaign_pacing', jsonb_build_object(
    'chunk_size', 25,      -- emails per batch
    'pause_ms', 20000      -- pause between batches → ~75/minute
  ))
on conflict (key) do update set value = app_settings.value || excluded.value;

notify pgrst, 'reload schema';

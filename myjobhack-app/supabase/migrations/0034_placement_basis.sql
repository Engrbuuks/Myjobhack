-- ============================================================
-- MYJOBHACK App — Migration 0034 · Placement fee basis
--
-- The Elite placement fee was calculated as a percentage of ONE MONTH's
-- salary — roughly a twelfth of the recruitment-industry norm. This makes
-- the basis configurable and defaults it to ANNUAL salary.
--
--   annual   → percent × (monthly salary × 12)   [default, industry standard]
--   monthly  → percent × monthly salary          [the old behaviour]
--   multiple → monthly salary × N months
--
-- Run after 0033.
-- ============================================================

insert into app_settings (key, value) values
  ('pricing', jsonb_build_object(
    'placement_basis', 'annual',      -- annual | monthly | multiple
    'placement_multiple', 1           -- months of salary, when basis = 'multiple'
  ))
on conflict (key) do update set value = app_settings.value || excluded.value;

-- Record which basis each placement used, so historic fees stay explainable
-- even after you change the pricing rule.
alter table placements add column if not exists fee_basis_detail text;

notify pgrst, 'reload schema';

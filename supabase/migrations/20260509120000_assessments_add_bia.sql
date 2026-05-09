-- Bioimpedance (BIA) fields for the assessments table.
--
-- Until now, %body fat was always derived from skinfold measurements (Siri
-- formula). Many users own or visit clinics with bioimpedance scales whose
-- output they want to record alongside (or instead of) skinfolds.
--
-- All new columns are nullable so existing rows are unaffected. Reads from
-- the app fall back to the legacy skinfold-only behaviour when these are
-- NULL.
--
-- Storage strategy
-- ────────────────
-- - body_fat_percentage_skinfold:
--     The skinfold-derived %BF kept as a stable historical record. Required
--     because body_fat_percentage now becomes the "blended" value (avg of
--     skinfold + BIA when both exist), which would otherwise erase the
--     skinfold-only number from the assessment.
-- - bia_body_fat_percentage:
--     The %BF reported by the bioimpedance scale. Manually entered.
-- - bia_lean_mass / bia_fat_mass / bia_water_percentage / bia_visceral_fat /
--   bia_metabolic_age:
--     Optional extras that BIA scales typically print. Stored verbatim as
--     reported by the device.
--
-- The legacy column body_fat_percentage stays as the single number used for
-- historical charts and trends:
--   • old rows               → unchanged (skinfold-only value, as before)
--   • new with skinfold only → skinfold value
--   • new with BIA only      → BIA value
--   • new with both          → simple average (skinfold + BIA) / 2
--
-- This keeps the evolution chart continuous while letting the UI surface
-- all three readings ("dobras", "bioimpedância", "média") side by side.

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS body_fat_percentage_skinfold numeric,
  ADD COLUMN IF NOT EXISTS bia_body_fat_percentage      numeric,
  ADD COLUMN IF NOT EXISTS bia_lean_mass                numeric,
  ADD COLUMN IF NOT EXISTS bia_fat_mass                 numeric,
  ADD COLUMN IF NOT EXISTS bia_water_percentage         numeric,
  ADD COLUMN IF NOT EXISTS bia_visceral_fat             numeric,
  ADD COLUMN IF NOT EXISTS bia_metabolic_age            numeric;

-- Sanity bounds. We're permissive enough to allow weird devices, but reject
-- obvious garbage (negative %, %>100, etc.).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assessments_bia_body_fat_pct_chk'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_bia_body_fat_pct_chk
      CHECK (bia_body_fat_percentage IS NULL OR (bia_body_fat_percentage >= 0 AND bia_body_fat_percentage <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assessments_bia_water_pct_chk'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_bia_water_pct_chk
      CHECK (bia_water_percentage IS NULL OR (bia_water_percentage >= 0 AND bia_water_percentage <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assessments_bf_skinfold_pct_chk'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_bf_skinfold_pct_chk
      CHECK (body_fat_percentage_skinfold IS NULL OR (body_fat_percentage_skinfold >= 0 AND body_fat_percentage_skinfold <= 100));
  END IF;
END $$;

COMMENT ON COLUMN public.assessments.body_fat_percentage_skinfold IS
  'Skinfold-derived %BF (Siri). Stable historical record even when body_fat_percentage holds the blended skinfold+BIA average.';
COMMENT ON COLUMN public.assessments.bia_body_fat_percentage IS
  '%BF reported by the user''s bioimpedance scale (manual entry).';
COMMENT ON COLUMN public.assessments.bia_lean_mass IS 'BIA: lean mass in kg.';
COMMENT ON COLUMN public.assessments.bia_fat_mass IS 'BIA: fat mass in kg.';
COMMENT ON COLUMN public.assessments.bia_water_percentage IS 'BIA: total body water %.';
COMMENT ON COLUMN public.assessments.bia_visceral_fat IS 'BIA: visceral fat index (device-specific scale).';
COMMENT ON COLUMN public.assessments.bia_metabolic_age IS 'BIA: estimated metabolic age in years.';

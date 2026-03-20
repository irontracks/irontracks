-- Migration: Fix nutrition_meal_entries.date for timezone drift
-- Problem: Entries saved before 2026-03-20 used the Vercel server's UTC clock
-- to compute the `date` column. This caused entries created after 21:00 BRT
-- (= 00:00 UTC next day) to be tagged with the next calendar day instead of
-- the correct São Paulo date.
--
-- Fix: Re-derive `date` from `created_at` converted to America/Sao_Paulo,
-- then also fix the daily_nutrition_logs totals for every affected date.
-- Only touches rows where the stored date does NOT match the BRT date derived
-- from created_at (i.e., actually wrong rows).

BEGIN;

-- Step 1: Fix nutrition_meal_entries.date
UPDATE nutrition_meal_entries
SET date = (created_at AT TIME ZONE 'America/Sao_Paulo')::date
WHERE date <> (created_at AT TIME ZONE 'America/Sao_Paulo')::date;

-- Step 2: Recalculate daily_nutrition_logs for every (user_id, date) pair
-- that may have been affected by the wrong dates. We do a full recalc from 
-- the corrected meal entries for all historical data (safe, idempotent).
--
-- This replaces any wrong totals that accumulated under the wrong date key.
INSERT INTO daily_nutrition_logs (user_id, date, calories, protein, carbs, fat)
SELECT
  user_id,
  date,
  ROUND(SUM(calories)),
  ROUND(SUM(protein)),
  ROUND(SUM(carbs)),
  ROUND(SUM(fat))
FROM nutrition_meal_entries
GROUP BY user_id, date
ON CONFLICT (user_id, date)
DO UPDATE SET
  calories = EXCLUDED.calories,
  protein  = EXCLUDED.protein,
  carbs    = EXCLUDED.carbs,
  fat      = EXCLUDED.fat;

COMMIT;

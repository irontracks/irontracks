-- Add water_ml column to daily_nutrition_logs
-- This allows tracking daily water intake alongside macros.
ALTER TABLE daily_nutrition_logs
  ADD COLUMN IF NOT EXISTS water_ml integer NOT NULL DEFAULT 0;

-- Add a comment for documentation
COMMENT ON COLUMN daily_nutrition_logs.water_ml IS 'Daily water intake in milliliters';

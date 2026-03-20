-- Migration: Custom Food Library (nutrition_custom_foods)
-- Stores user-defined foods scanned from nutrition label photos.
-- Apply in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS nutrition_custom_foods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,              -- Primary display name (e.g. "Whey True WPI")
  aliases        TEXT[] NOT NULL DEFAULT '{}', -- Alternative names for matching (e.g. ["whey", "wpi"])
  serving_size_g NUMERIC(8,2) NOT NULL DEFAULT 100, -- Reference portion size in grams
  kcal_per100g   NUMERIC(8,2) NOT NULL DEFAULT 0,
  protein_per100g NUMERIC(8,2) NOT NULL DEFAULT 0,
  carbs_per100g  NUMERIC(8,2) NOT NULL DEFAULT 0,
  fat_per100g    NUMERIC(8,2) NOT NULL DEFAULT 0,
  fiber_per100g  NUMERIC(8,2) NOT NULL DEFAULT 0,
  label_image_url TEXT,                      -- Supabase Storage URL of label photo
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE nutrition_custom_foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_custom_foods" ON nutrition_custom_foods;
CREATE POLICY "users_own_custom_foods" ON nutrition_custom_foods
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Fast lookup by user + name (case-insensitive via lower index)
CREATE INDEX IF NOT EXISTS idx_nutrition_custom_foods_user_id
  ON nutrition_custom_foods (user_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_custom_foods_name_lower
  ON nutrition_custom_foods (user_id, lower(name));

-- Limit 50 custom foods per user (trigger)
CREATE OR REPLACE FUNCTION check_custom_foods_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM nutrition_custom_foods WHERE user_id = NEW.user_id) >= 50 THEN
    RAISE EXCEPTION 'custom_foods_limit_reached';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_custom_foods_limit ON nutrition_custom_foods;
CREATE TRIGGER trg_custom_foods_limit
  BEFORE INSERT ON nutrition_custom_foods
  FOR EACH ROW EXECUTE FUNCTION check_custom_foods_limit();

-- Migration: nutrition_favorite_meals
-- Creates the table to store saved meal favorites per user
-- Apply in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS nutrition_favorite_meals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (char_length(name) > 0 AND char_length(name) <= 60),
  meal_text   TEXT NOT NULL CHECK (char_length(meal_text) > 0 AND char_length(meal_text) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE nutrition_favorite_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_favorites" ON nutrition_favorite_meals;
CREATE POLICY "users_own_favorites" ON nutrition_favorite_meals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Index for fast per-user lookups
CREATE INDEX IF NOT EXISTS idx_nutrition_favorites_user_id
  ON nutrition_favorite_meals (user_id, created_at DESC);

-- Limit: enforce max 10 favorites per user via trigger
CREATE OR REPLACE FUNCTION check_favorite_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM nutrition_favorite_meals WHERE user_id = NEW.user_id) >= 10 THEN
    RAISE EXCEPTION 'Maximum of 10 favorite meals reached';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_favorite_limit ON nutrition_favorite_meals;
CREATE TRIGGER enforce_favorite_limit
  BEFORE INSERT ON nutrition_favorite_meals
  FOR EACH ROW EXECUTE FUNCTION check_favorite_limit();

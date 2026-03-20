-- Learned foods from AI estimations per user.
-- When the local parser doesn't recognize a food and the AI estimates it,
-- the result is stored here so next time it's recognized locally.
CREATE TABLE IF NOT EXISTS nutrition_learned_foods (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_key text NOT NULL,            -- normalized key (lowercase, no accents)
  display_name text NOT NULL,        -- human-readable food name
  kcal_per_100g numeric NOT NULL,
  protein_per_100g numeric NOT NULL,
  carbs_per_100g numeric NOT NULL,
  fat_per_100g numeric NOT NULL,
  source text DEFAULT 'ai',          -- 'ai' or 'manual'
  use_count integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, food_key)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_learned_foods_user
  ON nutrition_learned_foods(user_id);

-- RLS
ALTER TABLE nutrition_learned_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own learned foods"
  ON nutrition_learned_foods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own learned foods"
  ON nutrition_learned_foods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own learned foods"
  ON nutrition_learned_foods FOR UPDATE
  USING (auth.uid() = user_id);

-- Migration: Meal Reminders for push notifications
-- Apply in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS nutrition_meal_reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hour        SMALLINT NOT NULL CHECK (hour >= 0 AND hour <= 23),
  minute      SMALLINT NOT NULL DEFAULT 0 CHECK (minute >= 0 AND minute <= 59),
  label       TEXT NOT NULL DEFAULT 'Refeição',   -- e.g. "Café da manhã"
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, hour, minute)
);

ALTER TABLE nutrition_meal_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_reminders" ON nutrition_meal_reminders;
CREATE POLICY "users_own_reminders" ON nutrition_meal_reminders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_reminders_user ON nutrition_meal_reminders (user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_reminders_enabled ON nutrition_meal_reminders (hour, enabled);

CREATE TABLE IF NOT EXISTS exercise_personal_records (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  best_weight NUMERIC NOT NULL DEFAULT 0,
  best_reps NUMERIC NOT NULL DEFAULT 0,
  best_volume NUMERIC NOT NULL DEFAULT 0,
  workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exercise_name)
);

ALTER TABLE exercise_personal_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own PRs"
  ON exercise_personal_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "service role full access"
  ON exercise_personal_records FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_prs_user_id ON exercise_personal_records(user_id);

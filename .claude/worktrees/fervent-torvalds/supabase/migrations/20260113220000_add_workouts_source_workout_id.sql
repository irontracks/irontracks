DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'source_workout_id'
  ) THEN
    ALTER TABLE public.workouts ADD COLUMN source_workout_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS workouts_user_source_idx
  ON public.workouts (user_id, source_workout_id);


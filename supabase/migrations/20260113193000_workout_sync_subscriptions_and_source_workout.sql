ALTER TABLE public.workouts
ADD COLUMN IF NOT EXISTS source_workout_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workouts_source_workout_id_fkey'
  ) THEN
    ALTER TABLE public.workouts
    ADD CONSTRAINT workouts_source_workout_id_fkey
    FOREIGN KEY (source_workout_id) REFERENCES public.workouts(id)
    ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workouts_source_workout_id ON public.workouts(source_workout_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workouts_user_source_workout
ON public.workouts(user_id, source_workout_id)
WHERE source_workout_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.workout_sync_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workout_sync_subscriptions_source_target
ON public.workout_sync_subscriptions(source_user_id, target_user_id);

ALTER TABLE public.workout_sync_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_workout_sync_subscriptions') THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at_workout_sync_subscriptions()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_workout_sync_subscriptions_updated_at ON public.workout_sync_subscriptions;
CREATE TRIGGER trg_workout_sync_subscriptions_updated_at
BEFORE UPDATE ON public.workout_sync_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_workout_sync_subscriptions();

DROP POLICY IF EXISTS "workout_sync_subscriptions_select" ON public.workout_sync_subscriptions;
CREATE POLICY "workout_sync_subscriptions_select"
ON public.workout_sync_subscriptions
FOR SELECT
USING (auth.uid() = source_user_id OR auth.uid() = target_user_id);

DROP POLICY IF EXISTS "workout_sync_subscriptions_insert" ON public.workout_sync_subscriptions;
CREATE POLICY "workout_sync_subscriptions_insert"
ON public.workout_sync_subscriptions
FOR INSERT
WITH CHECK (auth.uid() = source_user_id);

DROP POLICY IF EXISTS "workout_sync_subscriptions_update" ON public.workout_sync_subscriptions;
CREATE POLICY "workout_sync_subscriptions_update"
ON public.workout_sync_subscriptions
FOR UPDATE
USING (auth.uid() = source_user_id)
WITH CHECK (auth.uid() = source_user_id);

DROP POLICY IF EXISTS "workout_sync_subscriptions_delete" ON public.workout_sync_subscriptions;
CREATE POLICY "workout_sync_subscriptions_delete"
ON public.workout_sync_subscriptions
FOR DELETE
USING (auth.uid() = source_user_id);


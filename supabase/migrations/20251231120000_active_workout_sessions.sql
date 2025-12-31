CREATE TABLE IF NOT EXISTS public.active_workout_sessions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS active_workout_sessions_updated_at_idx ON public.active_workout_sessions(updated_at);

ALTER TABLE public.active_workout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS active_workout_sessions_select ON public.active_workout_sessions;
CREATE POLICY active_workout_sessions_select
ON public.active_workout_sessions
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS active_workout_sessions_insert ON public.active_workout_sessions;
CREATE POLICY active_workout_sessions_insert
ON public.active_workout_sessions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS active_workout_sessions_update ON public.active_workout_sessions;
CREATE POLICY active_workout_sessions_update
ON public.active_workout_sessions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR public.is_admin())
WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS active_workout_sessions_delete ON public.active_workout_sessions;
CREATE POLICY active_workout_sessions_delete
ON public.active_workout_sessions
FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'active_workout_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.active_workout_sessions;
    END IF;
  END IF;
END $$;

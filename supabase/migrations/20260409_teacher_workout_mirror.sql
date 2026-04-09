-- Migration: teacher_workout_mirror
-- Adds RLS policy so teachers can read active_workout_sessions for their students.

-- Ensure RLS is enabled on active_workout_sessions
ALTER TABLE public.active_workout_sessions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their own session (existing behavior)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'active_workout_sessions'
      AND policyname = 'Users can read own active session'
  ) THEN
    CREATE POLICY "Users can read own active session"
      ON public.active_workout_sessions
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Allow authenticated users to upsert their own session (existing behavior)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'active_workout_sessions'
      AND policyname = 'Users can upsert own active session'
  ) THEN
    CREATE POLICY "Users can upsert own active session"
      ON public.active_workout_sessions
      FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Teachers can read sessions of their students
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'active_workout_sessions'
      AND policyname = 'Teachers can read student active sessions'
  ) THEN
    CREATE POLICY "Teachers can read student active sessions"
      ON public.active_workout_sessions
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.students s
          WHERE s.user_id = active_workout_sessions.user_id
            AND s.teacher_id = auth.uid()
        )
      );
  END IF;
END $$;

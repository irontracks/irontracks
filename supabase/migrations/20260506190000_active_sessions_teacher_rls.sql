-- Restore RLS policy: teachers can SELECT active_workout_sessions of their students.
--
-- This policy was originally added in 20260409_teacher_workout_mirror.sql but was
-- removed by a manual SQL operation outside the migrations workflow (verified
-- 2026-05-06: pg_policies showed only owner+admin policies on this table).
--
-- Without this policy:
-- - useTeacherStudentSessions returns {} (teacher can't see which students are training)
-- - useTeacherControl Realtime subscription gets no events
-- - The "🟢 Treinando" badge never appears
-- - The "Assumir Controle" button never appears
--
-- Realtime is already enabled (verified in supabase_realtime publication).

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

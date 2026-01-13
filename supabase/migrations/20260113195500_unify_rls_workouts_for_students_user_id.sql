DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workouts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.workouts', pol.policyname);
  END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exercises' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exercises', pol.policyname);
  END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sets' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sets', pol.policyname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'teacher';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.students ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY workouts_select ON public.workouts
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.user_id = public.workouts.user_id
      AND s.teacher_id = auth.uid()
  )
);

CREATE POLICY workouts_insert ON public.workouts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.user_id = public.workouts.user_id
      AND s.teacher_id = auth.uid()
  )
);

CREATE POLICY workouts_update ON public.workouts
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR COALESCE(created_by, user_id) = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.user_id = public.workouts.user_id
      AND s.teacher_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR COALESCE(created_by, user_id) = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.user_id = public.workouts.user_id
      AND s.teacher_id = auth.uid()
  )
);

CREATE POLICY workouts_delete ON public.workouts
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR COALESCE(created_by, user_id) = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.user_id = public.workouts.user_id
      AND s.teacher_id = auth.uid()
  )
);

CREATE POLICY exercises_select ON public.exercises
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = public.exercises.workout_id
      AND (
        w.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY exercises_insert ON public.exercises
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = public.exercises.workout_id
      AND (
        COALESCE(w.created_by, w.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY exercises_update ON public.exercises
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = public.exercises.workout_id
      AND (
        COALESCE(w.created_by, w.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = public.exercises.workout_id
      AND (
        COALESCE(w.created_by, w.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY exercises_delete ON public.exercises
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = public.exercises.workout_id
      AND (
        COALESCE(w.created_by, w.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY sets_select ON public.sets
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.exercises e
    JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = public.sets.exercise_id
      AND (
        w.user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY sets_insert ON public.sets
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.exercises e
    JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = public.sets.exercise_id
      AND (
        COALESCE(w.created_by, w.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY sets_update ON public.sets
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.exercises e
    JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = public.sets.exercise_id
      AND (
        COALESCE(w.created_by, w.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.exercises e
    JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = public.sets.exercise_id
      AND (
        COALESCE(w.created_by, w.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
);

CREATE POLICY sets_delete ON public.sets
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.exercises e
    JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = public.sets.exercise_id
      AND (
        COALESCE(w.created_by, w.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.students s
          WHERE s.user_id = w.user_id
            AND s.teacher_id = auth.uid()
        )
      )
  )
);

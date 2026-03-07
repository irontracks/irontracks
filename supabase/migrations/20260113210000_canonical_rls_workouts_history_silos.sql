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
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'students' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.students', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

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
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
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

CREATE OR REPLACE FUNCTION public.is_teacher_of(target_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.user_id = target_user_id
      AND s.teacher_id = auth.uid()
  );
$$;

CREATE POLICY students_select_silo ON public.students
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR teacher_id = auth.uid()
  OR user_id = auth.uid()
);

CREATE POLICY students_insert_silo ON public.students
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR teacher_id = auth.uid()
);

CREATE POLICY students_update_silo ON public.students
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR teacher_id = auth.uid()
)
WITH CHECK (
  public.is_admin()
  OR teacher_id = auth.uid()
);

CREATE POLICY students_delete_silo ON public.students
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR teacher_id = auth.uid()
);

CREATE POLICY workouts_select_silo ON public.workouts
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR user_id = auth.uid()
  OR public.is_teacher_of(user_id)
);

CREATE POLICY workouts_insert_silo ON public.workouts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND created_by = auth.uid()
  )
  OR (
    public.is_teacher_of(user_id)
    AND created_by = auth.uid()
    AND is_template = true
  )
);

CREATE POLICY workouts_update_silo ON public.workouts
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND created_by = auth.uid()
  )
  OR (
    public.is_teacher_of(user_id)
    AND created_by = auth.uid()
    AND is_template = true
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND created_by = auth.uid()
  )
  OR (
    public.is_teacher_of(user_id)
    AND created_by = auth.uid()
    AND is_template = true
  )
);

CREATE POLICY workouts_delete_silo ON public.workouts
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND created_by = auth.uid()
  )
  OR (
    public.is_teacher_of(user_id)
    AND created_by = auth.uid()
    AND is_template = true
  )
);

CREATE POLICY exercises_select_silo ON public.exercises
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
        OR public.is_teacher_of(w.user_id)
      )
  )
);

CREATE POLICY exercises_insert_silo ON public.exercises
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = public.exercises.workout_id
      AND (
        (w.user_id = auth.uid() AND w.created_by = auth.uid())
        OR (public.is_teacher_of(w.user_id) AND w.created_by = auth.uid() AND w.is_template = true)
      )
  )
);

CREATE POLICY exercises_update_silo ON public.exercises
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = public.exercises.workout_id
      AND (
        (w.user_id = auth.uid() AND w.created_by = auth.uid())
        OR (public.is_teacher_of(w.user_id) AND w.created_by = auth.uid() AND w.is_template = true)
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
        (w.user_id = auth.uid() AND w.created_by = auth.uid())
        OR (public.is_teacher_of(w.user_id) AND w.created_by = auth.uid() AND w.is_template = true)
      )
  )
);

CREATE POLICY exercises_delete_silo ON public.exercises
FOR DELETE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.workouts w
    WHERE w.id = public.exercises.workout_id
      AND (
        (w.user_id = auth.uid() AND w.created_by = auth.uid())
        OR (public.is_teacher_of(w.user_id) AND w.created_by = auth.uid() AND w.is_template = true)
      )
  )
);

CREATE POLICY sets_select_silo ON public.sets
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
        OR public.is_teacher_of(w.user_id)
      )
  )
);

CREATE POLICY sets_insert_silo ON public.sets
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
        (w.user_id = auth.uid() AND w.created_by = auth.uid())
        OR (public.is_teacher_of(w.user_id) AND w.created_by = auth.uid() AND w.is_template = true)
      )
  )
);

CREATE POLICY sets_update_silo ON public.sets
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
        (w.user_id = auth.uid() AND w.created_by = auth.uid())
        OR (public.is_teacher_of(w.user_id) AND w.created_by = auth.uid() AND w.is_template = true)
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
        (w.user_id = auth.uid() AND w.created_by = auth.uid())
        OR (public.is_teacher_of(w.user_id) AND w.created_by = auth.uid() AND w.is_template = true)
      )
  )
);

CREATE POLICY sets_delete_silo ON public.sets
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
        (w.user_id = auth.uid() AND w.created_by = auth.uid())
        OR (public.is_teacher_of(w.user_id) AND w.created_by = auth.uid() AND w.is_template = true)
      )
  )
);


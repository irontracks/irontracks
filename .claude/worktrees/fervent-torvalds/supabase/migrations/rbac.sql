-- RBAC Migration: profiles.role, students table, workouts.created_by and RLS policies

-- 1) profiles.role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'teacher';
  END IF;
END $$;

-- Helper function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
$$;

-- 2) students table with teacher ownership
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (safe guards)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='students' AND policyname='students_select') THEN
    DROP POLICY students_select ON public.students;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='students' AND policyname='students_insert') THEN
    DROP POLICY students_insert ON public.students;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='students' AND policyname='students_update') THEN
    DROP POLICY students_update ON public.students;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='students' AND policyname='students_delete') THEN
    DROP POLICY students_delete ON public.students;
  END IF;
END $$;

CREATE POLICY students_select ON public.students FOR SELECT USING (
  public.is_admin() OR teacher_id = auth.uid()
);
CREATE POLICY students_insert ON public.students FOR INSERT WITH CHECK (
  public.is_admin() OR teacher_id = auth.uid()
);
CREATE POLICY students_update ON public.students FOR UPDATE USING (
  public.is_admin() OR teacher_id = auth.uid()
) WITH CHECK (
  public.is_admin() OR teacher_id = auth.uid()
);
CREATE POLICY students_delete ON public.students FOR DELETE USING (
  public.is_admin() OR teacher_id = auth.uid()
);

-- 3) workouts.created_by and RBAC-sensitive policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.workouts ADD COLUMN created_by UUID REFERENCES auth.users(id);
    UPDATE public.workouts SET created_by = user_id WHERE created_by IS NULL;
  END IF;
END $$;

-- Enable RLS (already enabled in schema.sql, but ensure)
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sets ENABLE ROW LEVEL SECURITY;

-- Drop legacy policies to replace with role-aware versions
DO $$ BEGIN
  BEGIN DROP POLICY IF EXISTS "Users can view their own workouts" ON public.workouts; EXCEPTION WHEN OTHERS THEN END;
  BEGIN DROP POLICY IF EXISTS "Users can insert their own workouts" ON public.workouts; EXCEPTION WHEN OTHERS THEN END;
  BEGIN DROP POLICY IF EXISTS "Users can update their own workouts" ON public.workouts; EXCEPTION WHEN OTHERS THEN END;
  BEGIN DROP POLICY IF EXISTS "Users can delete their own workouts" ON public.workouts; EXCEPTION WHEN OTHERS THEN END;

  BEGIN DROP POLICY IF EXISTS "Users can view their own exercises" ON public.exercises; EXCEPTION WHEN OTHERS THEN END;
  BEGIN DROP POLICY IF EXISTS "Users can insert their own exercises" ON public.exercises; EXCEPTION WHEN OTHERS THEN END;
  BEGIN DROP POLICY IF EXISTS "Users can update their own exercises" ON public.exercises; EXCEPTION WHEN OTHERS THEN END;
  BEGIN DROP POLICY IF EXISTS "Users can delete their own exercises" ON public.exercises; EXCEPTION WHEN OTHERS THEN END;

  BEGIN DROP POLICY IF EXISTS "Users can view their own sets" ON public.sets; EXCEPTION WHEN OTHERS THEN END;
  BEGIN DROP POLICY IF EXISTS "Users can insert their own sets" ON public.sets; EXCEPTION WHEN OTHERS THEN END;
  BEGIN DROP POLICY IF EXISTS "Users can update their own sets" ON public.sets; EXCEPTION WHEN OTHERS THEN END;
  BEGIN DROP POLICY IF EXISTS "Users can delete their own sets" ON public.sets; EXCEPTION WHEN OTHERS THEN END;
END $$;

-- Workouts: admin sees/edits all, teacher only own records
CREATE POLICY workouts_select ON public.workouts FOR SELECT USING (
  public.is_admin() OR COALESCE(created_by, user_id) = auth.uid()
);
CREATE POLICY workouts_insert ON public.workouts FOR INSERT WITH CHECK (
  public.is_admin() OR COALESCE(created_by, user_id) = auth.uid()
);
CREATE POLICY workouts_update ON public.workouts FOR UPDATE USING (
  public.is_admin() OR COALESCE(created_by, user_id) = auth.uid()
) WITH CHECK (
  public.is_admin() OR COALESCE(created_by, user_id) = auth.uid()
);
CREATE POLICY workouts_delete ON public.workouts FOR DELETE USING (
  public.is_admin() OR COALESCE(created_by, user_id) = auth.uid()
);

-- Exercises: gate via owning workout
CREATE POLICY exercises_select ON public.exercises FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.workouts w WHERE w.id = exercises.workout_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
);
CREATE POLICY exercises_insert ON public.exercises FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workouts w WHERE w.id = exercises.workout_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
);
CREATE POLICY exercises_update ON public.exercises FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.workouts w WHERE w.id = exercises.workout_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workouts w WHERE w.id = exercises.workout_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
);
CREATE POLICY exercises_delete ON public.exercises FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.workouts w WHERE w.id = exercises.workout_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
);

-- Sets: gate via owning exercise->workout
CREATE POLICY sets_select ON public.sets FOR SELECT USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.exercises e JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = sets.exercise_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
);
CREATE POLICY sets_insert ON public.sets FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exercises e JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = sets.exercise_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
);
CREATE POLICY sets_update ON public.sets FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.exercises e JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = sets.exercise_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exercises e JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = sets.exercise_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
);
CREATE POLICY sets_delete ON public.sets FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.exercises e JOIN public.workouts w ON w.id = e.workout_id
    WHERE e.id = sets.exercise_id AND (public.is_admin() OR COALESCE(w.created_by, w.user_id) = auth.uid())
  )
);


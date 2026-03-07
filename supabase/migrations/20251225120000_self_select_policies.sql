DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'students'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.students ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS students_select_self ON public.students';
    EXECUTE 'CREATE POLICY students_select_self ON public.students FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'teachers'
      AND column_name = 'user_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS teachers_select_self ON public.teachers';
    EXECUTE 'CREATE POLICY teachers_select_self ON public.teachers FOR SELECT TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS profiles_select_self ON public.profiles';
    EXECUTE 'CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid())';
  END IF;
END $$;

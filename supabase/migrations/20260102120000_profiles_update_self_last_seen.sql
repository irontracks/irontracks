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
    EXECUTE 'DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles';
    EXECUTE 'CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true)';

    EXECUTE 'DROP POLICY IF EXISTS profiles_update_self ON public.profiles';
    EXECUTE 'CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid())';

    REVOKE ALL ON TABLE public.profiles FROM anon;
    REVOKE ALL ON TABLE public.profiles FROM authenticated;

    GRANT SELECT (id, display_name, photo_url, last_seen, role) ON TABLE public.profiles TO authenticated;
    GRANT UPDATE (display_name, photo_url, last_seen) ON TABLE public.profiles TO authenticated;
  END IF;
END $$;

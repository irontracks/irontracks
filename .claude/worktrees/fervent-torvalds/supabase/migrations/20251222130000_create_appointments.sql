DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
  ) THEN
    CREATE TABLE public.appointments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      coach_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
      title text NOT NULL,
      start_time timestamptz NOT NULL,
      end_time timestamptz NOT NULL,
      type text NOT NULL CHECK (type IN ('personal','assessment','other')),
      notes text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'appointments'
      AND policyname = 'coaches_manage_own_appointments'
  ) THEN
    CREATE POLICY coaches_manage_own_appointments
      ON public.appointments
      FOR ALL
      USING (auth.uid() = coach_id)
      WITH CHECK (auth.uid() = coach_id);
  END IF;
END $$;


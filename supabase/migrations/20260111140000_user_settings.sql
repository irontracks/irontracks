DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
  ) THEN
    CREATE TABLE public.user_settings (
      user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
      preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_select_self ON public.user_settings;
CREATE POLICY user_settings_select_self
ON public.user_settings
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_insert_self ON public.user_settings;
CREATE POLICY user_settings_insert_self
ON public.user_settings
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_settings_update_self ON public.user_settings;
CREATE POLICY user_settings_update_self
ON public.user_settings
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

REVOKE ALL ON TABLE public.user_settings FROM anon;
REVOKE ALL ON TABLE public.user_settings FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_settings TO authenticated;


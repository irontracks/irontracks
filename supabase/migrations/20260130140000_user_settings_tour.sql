DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
  ) THEN
    EXECUTE $SQL$
      ALTER TABLE public.user_settings
        ADD COLUMN IF NOT EXISTS tour_version integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS tour_completed_at timestamptz,
        ADD COLUMN IF NOT EXISTS tour_skipped_at timestamptz
    $SQL$;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'user_settings_tour_version_positive'
    ) THEN
      EXECUTE $SQL$
        ALTER TABLE public.user_settings
          ADD CONSTRAINT user_settings_tour_version_positive
          CHECK (tour_version > 0)
      $SQL$;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'user_settings_tour_completed_xor_skipped'
    ) THEN
      EXECUTE $SQL$
        ALTER TABLE public.user_settings
          ADD CONSTRAINT user_settings_tour_completed_xor_skipped
          CHECK (NOT (tour_completed_at IS NOT NULL AND tour_skipped_at IS NOT NULL))
      $SQL$;
    END IF;

    EXECUTE $SQL$
      CREATE INDEX IF NOT EXISTS user_settings_tour_completed_at_idx
        ON public.user_settings (tour_completed_at)
        WHERE tour_completed_at IS NOT NULL
    $SQL$;

    EXECUTE $SQL$
      CREATE INDEX IF NOT EXISTS user_settings_tour_skipped_at_idx
        ON public.user_settings (tour_skipped_at)
        WHERE tour_skipped_at IS NOT NULL
    $SQL$;
  END IF;
END $$;


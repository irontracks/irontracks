DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sets'
      AND column_name = 'is_warmup'
  ) THEN
    ALTER TABLE public.sets
      ADD COLUMN is_warmup boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sets'
      AND column_name = 'advanced_config'
  ) THEN
    ALTER TABLE public.sets
      ADD COLUMN advanced_config jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sets'
      AND column_name = 'method'
  ) THEN
    BEGIN
      UPDATE public.sets
      SET method = NULL
      WHERE lower(method::text) IN ('warm_up', 'warm-up', 'warmup');
    EXCEPTION
      WHEN undefined_column THEN
        NULL;
      WHEN OTHERS THEN
        NULL;
    END;

    BEGIN
      ALTER TABLE public.sets
        DROP CONSTRAINT IF EXISTS sets_method_no_warm_up;

      ALTER TABLE public.sets
        ADD CONSTRAINT sets_method_no_warm_up
        CHECK (method IS NULL OR lower(method::text) NOT IN ('warm_up', 'warm-up', 'warmup'));
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;
END $$;


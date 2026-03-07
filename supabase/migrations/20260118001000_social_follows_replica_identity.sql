DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'social_follows_pkey'
      AND c.conrelid = 'public.social_follows'::regclass
  ) THEN
    ALTER TABLE public.social_follows
      ADD CONSTRAINT social_follows_pkey PRIMARY KEY (follower_id, following_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'social_follows_unique'
      AND c.conrelid = 'public.social_follows'::regclass
  ) THEN
    ALTER TABLE public.social_follows
      DROP CONSTRAINT social_follows_unique;
  END IF;
END $$;


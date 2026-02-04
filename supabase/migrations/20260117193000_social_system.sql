DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'social_follow_status'
  ) THEN
    CREATE TYPE public.social_follow_status AS ENUM ('pending', 'accepted');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.social_follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.social_follow_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_follows_no_self CHECK (follower_id <> following_id),
  CONSTRAINT social_follows_unique UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_social_follows_follower ON public.social_follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_social_follows_following ON public.social_follows (following_id);
CREATE INDEX IF NOT EXISTS idx_social_follows_status ON public.social_follows (status);

ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "social_follows_insert_follower" ON public.social_follows
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = follower_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "social_follows_select_participants" ON public.social_follows
    FOR SELECT TO authenticated
    USING (auth.uid() = follower_id OR auth.uid() = following_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "social_follows_update_following" ON public.social_follows
    FOR UPDATE TO authenticated
    USING (auth.uid() = following_id)
    WITH CHECK (auth.uid() = following_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "social_follows_delete_participants" ON public.social_follows
    FOR DELETE TO authenticated
    USING (auth.uid() = follower_id OR auth.uid() = following_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
  ) THEN
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS recipient_id uuid;
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS sender_id uuid;
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

    UPDATE public.notifications
      SET recipient_id = user_id
      WHERE recipient_id IS NULL;

    UPDATE public.notifications
      SET is_read = read
      WHERE is_read IS DISTINCT FROM read;

    ALTER TABLE public.notifications
      ALTER COLUMN recipient_id SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_sender ON public.notifications(sender_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notifications_normalize_social_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.recipient_id IS NULL THEN
    NEW.recipient_id := NEW.user_id;
  END IF;

  IF NEW.is_read IS NULL THEN
    NEW.is_read := false;
  END IF;

  IF NEW.read IS NULL THEN
    NEW.read := false;
  END IF;

  IF NEW.is_read IS DISTINCT FROM NEW.read THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_read := NEW.read;
    ELSE
      IF NEW.is_read IS DISTINCT FROM OLD.is_read THEN
        NEW.read := NEW.is_read;
      ELSIF NEW.read IS DISTINCT FROM OLD.read THEN
        NEW.is_read := NEW.read;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'notifications'
  ) THEN
    DROP TRIGGER IF EXISTS notifications_normalize_social_columns ON public.notifications;
    CREATE TRIGGER notifications_normalize_social_columns
      BEFORE INSERT OR UPDATE ON public.notifications
      FOR EACH ROW
      EXECUTE FUNCTION public.notifications_normalize_social_columns();
  END IF;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.social_follows;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


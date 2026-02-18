BEGIN;

CREATE TABLE IF NOT EXISTS public.update_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  version text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  release_date timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS update_notifications_active_idx
  ON public.update_notifications (is_active, release_date DESC);

CREATE INDEX IF NOT EXISTS update_notifications_version_idx
  ON public.update_notifications (version);

ALTER TABLE public.update_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS update_notifications_select_active ON public.update_notifications;
  DROP POLICY IF EXISTS update_notifications_insert_admin ON public.update_notifications;
  DROP POLICY IF EXISTS update_notifications_update_admin ON public.update_notifications;
  DROP POLICY IF EXISTS update_notifications_delete_admin ON public.update_notifications;
END $$;

CREATE POLICY update_notifications_select_active
  ON public.update_notifications
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR (is_active = true AND release_date <= now()));

CREATE POLICY update_notifications_insert_admin
  ON public.update_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY update_notifications_update_admin
  ON public.update_notifications
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY update_notifications_delete_admin
  ON public.update_notifications
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.user_update_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  update_id uuid NOT NULL REFERENCES public.update_notifications(id) ON DELETE CASCADE,
  prompted_at timestamptz,
  viewed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS user_update_views_user_update_uidx
  ON public.user_update_views (user_id, update_id);

CREATE INDEX IF NOT EXISTS user_update_views_user_idx
  ON public.user_update_views (user_id, viewed_at, prompted_at);

ALTER TABLE public.user_update_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS user_update_views_select_own ON public.user_update_views;
  DROP POLICY IF EXISTS user_update_views_insert_own ON public.user_update_views;
  DROP POLICY IF EXISTS user_update_views_update_own ON public.user_update_views;
  DROP POLICY IF EXISTS user_update_views_delete_own ON public.user_update_views;
END $$;

CREATE POLICY user_update_views_select_own
  ON public.user_update_views
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_update_views_insert_own
  ON public.user_update_views
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_update_views_update_own
  ON public.user_update_views
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_update_views_delete_own
  ON public.user_update_views
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.vip_welcome_views (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vip_welcome_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS vip_welcome_views_select_own ON public.vip_welcome_views;
  DROP POLICY IF EXISTS vip_welcome_views_insert_own ON public.vip_welcome_views;
  DROP POLICY IF EXISTS vip_welcome_views_update_own ON public.vip_welcome_views;
END $$;

CREATE POLICY vip_welcome_views_select_own
  ON public.vip_welcome_views
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY vip_welcome_views_insert_own
  ON public.vip_welcome_views
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY vip_welcome_views_update_own
  ON public.vip_welcome_views
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;

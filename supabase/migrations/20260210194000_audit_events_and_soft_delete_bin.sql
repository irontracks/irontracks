BEGIN;

CREATE TABLE IF NOT EXISTS public.audit_events (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_events_entity_idx
  ON public.audit_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_action_idx
  ON public.audit_events (action, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS audit_events_select_admin ON public.audit_events;
  DROP POLICY IF EXISTS audit_events_insert_service ON public.audit_events;
END $$;

CREATE POLICY audit_events_select_admin
  ON public.audit_events
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY audit_events_insert_service
  ON public.audit_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.soft_delete_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid,
  delete_reason text,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_paths text[] NOT NULL DEFAULT '{}'::text[],
  purge_after timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  purged_at timestamptz
);

CREATE INDEX IF NOT EXISTS soft_delete_bin_purge_idx
  ON public.soft_delete_bin (purged_at, purge_after);

ALTER TABLE public.soft_delete_bin ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS soft_delete_bin_select_admin ON public.soft_delete_bin;
  DROP POLICY IF EXISTS soft_delete_bin_insert_service ON public.soft_delete_bin;
END $$;

CREATE POLICY soft_delete_bin_select_admin
  ON public.soft_delete_bin
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY soft_delete_bin_insert_service
  ON public.soft_delete_bin
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMIT;


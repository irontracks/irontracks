-- Add archival + ordering fields to workouts.
-- Safe/idempotent migration (can be re-run).

DO $$
BEGIN
  -- archived_at: nullable (active when NULL)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE public.workouts
      ADD COLUMN archived_at timestamptz;
  END IF;

  -- sort_order: deterministic ordering for UI lists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workouts'
      AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE public.workouts
      ADD COLUMN sort_order integer;
  END IF;
END $$;

-- Ensure column defaults/constraints (works even if columns already existed).
ALTER TABLE public.workouts
  ALTER COLUMN archived_at SET DEFAULT NULL,
  ALTER COLUMN archived_at DROP NOT NULL,
  ALTER COLUMN sort_order SET DEFAULT 0;

-- Backfill any NULL sort_order (older rows) before enforcing NOT NULL.
UPDATE public.workouts
SET sort_order = 0
WHERE sort_order IS NULL;

ALTER TABLE public.workouts
  ALTER COLUMN sort_order SET NOT NULL;

-- Useful indexes for common list patterns (active vs archived + stable ordering).
-- Note: regular CREATE INDEX (not CONCURRENTLY) to keep compatibility with transactional migrations.

-- Active workouts (not archived): list ordered by sort_order, then newest.
CREATE INDEX IF NOT EXISTS workouts_user_template_active_sort_idx
  ON public.workouts (user_id, is_template, sort_order, created_at DESC)
  WHERE archived_at IS NULL;

-- Archived workouts: list ordered by archived_at (newest archived first).
CREATE INDEX IF NOT EXISTS workouts_user_template_archived_at_idx
  ON public.workouts (user_id, is_template, archived_at DESC)
  WHERE archived_at IS NOT NULL;


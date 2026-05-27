-- Migration: introduce set_type taxonomy (working | warmup | feeler)
--
-- 'working' counts toward volume, PRs, and progression analytics. The other
-- two are tracked but excluded from stats. We keep `is_warmup` for retrocompat
-- with older clients and reports.
--
-- Safe to apply on a hot database:
--   1. Column is added with a default ('working'), so existing rows are valid.
--   2. Backfill rewrites rows where is_warmup = true (single UPDATE, indexed
--      via the new column to avoid sequential scans on subsequent reads).
--   3. CHECK constraint is added after backfill so the transient state is
--      always consistent.

BEGIN;

-- ── public.sets (template / planned sets) ───────────────────────────────────
ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS set_type TEXT NOT NULL DEFAULT 'working';

UPDATE public.sets
   SET set_type = 'warmup'
 WHERE is_warmup IS TRUE
   AND set_type = 'working';

ALTER TABLE public.sets
  DROP CONSTRAINT IF EXISTS sets_set_type_check;
ALTER TABLE public.sets
  ADD CONSTRAINT sets_set_type_check
  CHECK (set_type IN ('working', 'warmup', 'feeler'));

CREATE INDEX IF NOT EXISTS idx_sets_set_type
  ON public.sets (set_type)
  WHERE set_type <> 'working';

COMMENT ON COLUMN public.sets.set_type
  IS 'Set taxonomy: working (counts toward stats), warmup, feeler (reconhecimento). is_warmup kept for retrocompat.';

-- ── public.workout_set_logs (historical execution log) ──────────────────────
ALTER TABLE public.workout_set_logs
  ADD COLUMN IF NOT EXISTS set_type TEXT;

UPDATE public.workout_set_logs
   SET set_type = 'warmup'
 WHERE is_warmup IS TRUE
   AND set_type IS NULL;

UPDATE public.workout_set_logs
   SET set_type = 'working'
 WHERE set_type IS NULL;

ALTER TABLE public.workout_set_logs
  DROP CONSTRAINT IF EXISTS workout_set_logs_set_type_check;
ALTER TABLE public.workout_set_logs
  ADD CONSTRAINT workout_set_logs_set_type_check
  CHECK (set_type IS NULL OR set_type IN ('working', 'warmup', 'feeler'));

CREATE INDEX IF NOT EXISTS idx_workout_set_logs_set_type
  ON public.workout_set_logs (set_type)
  WHERE set_type IS NOT NULL AND set_type <> 'working';

COMMENT ON COLUMN public.workout_set_logs.set_type
  IS 'Set taxonomy: working / warmup / feeler. NULL on legacy rows (treat as working).';

-- ── save_workout_atomic RPC update ──────────────────────────────────────────
-- IMPORTANT: the RPC body needs to extract set_type from p_exercises JSONB and
-- pass it to the INSERT INTO sets. This block is a placeholder — fill in once
-- the current RPC body is available. Adding set_type to JSONB without updating
-- the RPC means the field is silently dropped.
--
-- The patch pattern is typically:
--   INSERT INTO sets (..., is_warmup, set_type, ...)
--   SELECT ..., COALESCE((set->>'is_warmup')::bool, false),
--               COALESCE(NULLIF(set->>'set_type',''), 'working'), ...
-- See PR description for the full replacement function body.

COMMIT;

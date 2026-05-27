-- Migration: introduce set_type taxonomy (working | warmup | feeler)
--
-- 'working' counts toward volume, PRs, and progression analytics. The other
-- two are tracked but excluded from stats. We keep `is_warmup` for retrocompat
-- with older clients and reports.
--
-- Safe to apply on a hot database:
--   1. Columns are added with defaults so existing rows are valid.
--   2. Backfill rewrites is_warmup → set_type in a single UPDATE.
--   3. CHECK constraints are added after backfill.
--   4. save_workout_atomic RPC is replaced atomically (CREATE OR REPLACE).

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

-- ── save_workout_atomic: include set_type in the INSERT ─────────────────────
-- Same body as the previous version (search_path = '' empty, fully qualified
-- public.* references kept) — only the sets INSERT got two new lines: the
-- column and the value derived from the JSONB payload.
CREATE OR REPLACE FUNCTION public.save_workout_atomic(
  p_workout_id uuid,
  p_user_id uuid,
  p_created_by uuid,
  p_is_template boolean,
  p_name text,
  p_notes text,
  p_exercises jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_workout_id uuid;
  v_exercise jsonb;
  v_set jsonb;
  v_exercise_id uuid;
  v_order int;
  v_set_number int;
  v_set_type text;
  v_is_warmup boolean;
BEGIN
  IF p_workout_id IS NULL THEN
    INSERT INTO public.workouts (user_id, created_by, is_template, name, notes)
    VALUES (p_user_id, p_created_by, p_is_template, COALESCE(p_name, ''), p_notes)
    RETURNING id INTO v_workout_id;
  ELSE
    v_workout_id := p_workout_id;
    UPDATE public.workouts
    SET name = COALESCE(p_name, name),
        notes = p_notes,
        is_template = p_is_template
    WHERE id = v_workout_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'workout_not_found';
    END IF;
  END IF;

  DELETE FROM public.sets
  WHERE exercise_id IN (SELECT id FROM public.exercises WHERE workout_id = v_workout_id);
  DELETE FROM public.exercises WHERE workout_id = v_workout_id;

  v_order := 0;
  FOR v_exercise IN SELECT * FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb))
  LOOP
    INSERT INTO public.exercises (
      workout_id,
      name,
      notes,
      rest_time,
      video_url,
      method,
      cadence,
      "order"
    ) VALUES (
      v_workout_id,
      COALESCE(v_exercise->>'name', ''),
      COALESCE(v_exercise->>'notes', ''),
      NULLIF(COALESCE(v_exercise->>'rest_time', ''), '')::int,
      NULLIF(COALESCE(v_exercise->>'video_url', ''), ''),
      NULLIF(COALESCE(v_exercise->>'method', ''), ''),
      NULLIF(COALESCE(v_exercise->>'cadence', ''), ''),
      COALESCE((v_exercise->>'order')::int, v_order)
    )
    RETURNING id INTO v_exercise_id;

    v_set_number := 1;
    FOR v_set IN SELECT * FROM jsonb_array_elements(COALESCE(v_exercise->'sets', '[]'::jsonb))
    LOOP
      v_is_warmup := COALESCE((v_set->>'is_warmup')::boolean, false);
      v_set_type := NULLIF(v_set->>'set_type', '');
      IF v_set_type IS NULL OR v_set_type NOT IN ('working', 'warmup', 'feeler') THEN
        v_set_type := CASE WHEN v_is_warmup THEN 'warmup' ELSE 'working' END;
      END IF;
      -- keep flags consistent across both columns
      IF v_set_type = 'warmup' THEN v_is_warmup := true; END IF;

      INSERT INTO public.sets (
        exercise_id,
        weight,
        reps,
        rpe,
        set_number,
        completed,
        is_warmup,
        set_type,
        advanced_config
      ) VALUES (
        v_exercise_id,
        public.try_parse_numeric(v_set->>'weight'),
        NULLIF(COALESCE(v_set->>'reps', ''), ''),
        public.try_parse_numeric(v_set->>'rpe'),
        COALESCE((v_set->>'set_number')::int, v_set_number),
        COALESCE((v_set->>'completed')::boolean, false),
        v_is_warmup,
        v_set_type,
        v_set->'advanced_config'
      );
      v_set_number := v_set_number + 1;
    END LOOP;

    v_order := v_order + 1;
  END LOOP;

  RETURN v_workout_id;
END;
$function$;

COMMIT;

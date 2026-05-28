-- Migration: include is_unilateral, side_rest_time, transition_time in save_workout_atomic
--
-- These columns already exist in public.exercises (schema is complete).
-- The bug: buildExercisesPayload never sent them, and the RPC never wrote them.
-- Fix: update RPC INSERT to read those fields from the JSONB payload.

BEGIN;

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
      "order",
      is_unilateral,
      side_rest_time,
      transition_time
    ) VALUES (
      v_workout_id,
      COALESCE(v_exercise->>'name', ''),
      COALESCE(v_exercise->>'notes', ''),
      NULLIF(COALESCE(v_exercise->>'rest_time', ''), '')::int,
      NULLIF(COALESCE(v_exercise->>'video_url', ''), ''),
      NULLIF(COALESCE(v_exercise->>'method', ''), ''),
      NULLIF(COALESCE(v_exercise->>'cadence', ''), ''),
      COALESCE((v_exercise->>'order')::int, v_order),
      COALESCE((v_exercise->>'is_unilateral')::boolean, false),
      NULLIF(COALESCE(v_exercise->>'side_rest_time', ''), '')::int,
      NULLIF(COALESCE(v_exercise->>'transition_time', ''), '')::int
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

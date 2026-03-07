CREATE OR REPLACE FUNCTION public.save_workout_atomic(
  p_workout_id uuid,
  p_user_id uuid,
  p_created_by uuid,
  p_is_template boolean,
  p_name text,
  p_notes text,
  p_exercises jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_workout_id uuid;
  v_exercise jsonb;
  v_set jsonb;
  v_exercise_id uuid;
  v_order int;
  v_set_number int;
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
      INSERT INTO public.sets (
        exercise_id,
        weight,
        reps,
        rpe,
        set_number,
        completed,
        is_warmup,
        advanced_config
      ) VALUES (
        v_exercise_id,
        public.try_parse_numeric(v_set->>'weight'),
        NULLIF(COALESCE(v_set->>'reps', ''), ''),
        public.try_parse_numeric(v_set->>'rpe'),
        COALESCE((v_set->>'set_number')::int, v_set_number),
        COALESCE((v_set->>'completed')::boolean, false),
        COALESCE((v_set->>'is_warmup')::boolean, false),
        v_set->'advanced_config'
      );
      v_set_number := v_set_number + 1;
    END LOOP;

    v_order := v_order + 1;
  END LOOP;

  RETURN v_workout_id;
END;
$$;


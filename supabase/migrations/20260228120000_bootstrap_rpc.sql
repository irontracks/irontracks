-- Bootstrap RPC: retorna profile + workouts + exercises + sets em 1 query
-- Substitui 3-4 queries seriais por 1 chamada ao banco

CREATE OR REPLACE FUNCTION public.get_dashboard_bootstrap(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile jsonb;
  v_workouts jsonb;
  v_student_id uuid;
BEGIN
  -- 1) Profile
  SELECT jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'photo_url', p.photo_url,
    'role', p.role
  ) INTO v_profile
  FROM profiles p
  WHERE p.id = p_user_id;

  -- 2) Template workouts do user (com exercises + sets inline via lateral join)
  SELECT COALESCE(jsonb_agg(w_row ORDER BY w_row->>'name'), '[]'::jsonb)
  INTO v_workouts
  FROM (
    SELECT jsonb_build_object(
      'id', w.id,
      'user_id', w.user_id,
      'name', w.name,
      'notes', w.notes,
      'is_template', w.is_template,
      'archived_at', w.archived_at,
      'sort_order', w.sort_order,
      'created_at', w.created_at,
      'student_id', w.student_id,
      'date', w.date,
      'exercises', COALESCE(ex_agg.exercises, '[]'::jsonb)
    ) AS w_row
    FROM workouts w
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'workout_id', e.workout_id,
          'name', e.name,
          'muscle_group', e.muscle_group,
          'notes', e.notes,
          'video_url', e.video_url,
          'rest_time', e.rest_time,
          'cadence', e.cadence,
          'method', e.method,
          'order', e."order",
          'sets', COALESCE(s_agg.sets, '[]'::jsonb)
        ) ORDER BY e."order"
      ) AS exercises
      FROM exercises e
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'exercise_id', s.exercise_id,
            'weight', s.weight,
            'reps', s.reps,
            'rpe', s.rpe,
            'set_number', s.set_number,
            'completed', s.completed,
            'advanced_config', s.advanced_config
          ) ORDER BY s.set_number
        ) AS sets
        FROM sets s
        WHERE s.exercise_id = e.id
      ) s_agg ON true
      WHERE e.workout_id = w.id
    ) ex_agg ON true
    WHERE w.is_template = true AND w.user_id = p_user_id
  ) sub;

  -- 3) Se não achou templates, tenta workouts do user (qualquer)
  IF v_workouts = '[]'::jsonb THEN
    SELECT COALESCE(jsonb_agg(w_row ORDER BY w_row->>'name'), '[]'::jsonb)
    INTO v_workouts
    FROM (
      SELECT jsonb_build_object(
        'id', w.id,
        'user_id', w.user_id,
        'name', w.name,
        'notes', w.notes,
        'is_template', w.is_template,
        'archived_at', w.archived_at,
        'sort_order', w.sort_order,
        'created_at', w.created_at,
        'student_id', w.student_id,
        'date', w.date,
        'exercises', COALESCE(ex_agg.exercises, '[]'::jsonb)
      ) AS w_row
      FROM workouts w
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'workout_id', e.workout_id,
            'name', e.name,
            'muscle_group', e.muscle_group,
            'notes', e.notes,
            'video_url', e.video_url,
            'rest_time', e.rest_time,
            'cadence', e.cadence,
            'method', e.method,
            'order', e."order",
            'sets', COALESCE(s_agg.sets, '[]'::jsonb)
          ) ORDER BY e."order"
        ) AS exercises
        FROM exercises e
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', s.id,
              'exercise_id', s.exercise_id,
              'weight', s.weight,
              'reps', s.reps,
              'rpe', s.rpe,
              'set_number', s.set_number,
              'completed', s.completed,
              'advanced_config', s.advanced_config
            ) ORDER BY s.set_number
          ) AS sets
          FROM sets s
          WHERE s.exercise_id = e.id
        ) s_agg ON true
        WHERE e.workout_id = w.id
      ) ex_agg ON true
      WHERE w.user_id = p_user_id
      LIMIT 500
    ) sub;
  END IF;

  -- 4) Se AINDA vazio, tenta como estudante
  IF v_workouts = '[]'::jsonb THEN
    SELECT s.id INTO v_student_id
    FROM students s
    WHERE s.user_id = p_user_id
    LIMIT 1;

    IF v_student_id IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(w_row ORDER BY w_row->>'name'), '[]'::jsonb)
      INTO v_workouts
      FROM (
        SELECT jsonb_build_object(
          'id', w.id,
          'user_id', w.user_id,
          'name', w.name,
          'notes', w.notes,
          'is_template', w.is_template,
          'archived_at', w.archived_at,
          'sort_order', w.sort_order,
          'created_at', w.created_at,
          'student_id', w.student_id,
          'date', w.date,
          'exercises', COALESCE(ex_agg.exercises, '[]'::jsonb)
        ) AS w_row
        FROM workouts w
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', e.id,
              'workout_id', e.workout_id,
              'name', e.name,
              'muscle_group', e.muscle_group,
              'notes', e.notes,
              'video_url', e.video_url,
              'rest_time', e.rest_time,
              'cadence', e.cadence,
              'method', e.method,
              'order', e."order",
              'sets', COALESCE(s_agg.sets, '[]'::jsonb)
            ) ORDER BY e."order"
          ) AS exercises
          FROM exercises e
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'exercise_id', s.exercise_id,
                'weight', s.weight,
                'reps', s.reps,
                'rpe', s.rpe,
                'set_number', s.set_number,
                'completed', s.completed,
                'advanced_config', s.advanced_config
              ) ORDER BY s.set_number
            ) AS sets
            FROM sets s
            WHERE s.exercise_id = e.id
          ) s_agg ON true
          WHERE e.workout_id = w.id
        ) ex_agg ON true
        WHERE w.is_template = true
          AND (w.user_id = v_student_id OR w.student_id = v_student_id)
        LIMIT 500
      ) sub;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', COALESCE(v_profile, 'null'::jsonb),
    'workouts', v_workouts
  );
END;
$$;

-- Grant to authenticated users (via supabase RPC)
GRANT EXECUTE ON FUNCTION public.get_dashboard_bootstrap(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_bootstrap(uuid) TO service_role;

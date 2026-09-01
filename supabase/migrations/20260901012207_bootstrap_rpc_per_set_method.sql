-- get_dashboard_bootstrap: leva o MÉTODO POR SÉRIE (`sets.per_set_method`).
--
-- O campo entra por CONCATENAÇÃO condicional, e não como mais uma chave do
-- `jsonb_build_object`: ele é NULL na esmagadora maioria das séries, e emitir
-- `"per_set_method": null` em todas custaria ~25 B por série — o payload do
-- bootstrap tem teto medido (guard `bootstrapPayloadShape.test.ts`, 9,5 kB por
-- template) e um campo em TODAS as séries comeria metade da folga. Assim o
-- shape de hoje fica intacto e só cresce a série que de fato tem método salvo.
--
-- ⚠️ Esta migration foi escrita a partir da definição VIVA no banco, não do
-- arquivo de 20260703213937: aquele já estava atrás (não tem
-- `is_alternating`), e reaplicá-lo teria REGREDIDO a RPC em silêncio.
CREATE OR REPLACE FUNCTION public.get_dashboard_bootstrap(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile jsonb;
  v_workouts jsonb;
  v_student_id uuid;
BEGIN
  -- IDOR guard: só o próprio usuário (ou service_role no servidor) pode ler.
  IF p_user_id IS DISTINCT FROM auth.uid() AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'photo_url', p.photo_url,
    'role', p.role
  ) INTO v_profile
  FROM profiles p
  WHERE p.id = p_user_id;

  -- 1) Templates do próprio usuário.
  SELECT COALESCE(jsonb_agg(w_row ORDER BY w_row->>'name'), '[]'::jsonb)
  INTO v_workouts
  FROM (
    SELECT jsonb_build_object(
      'id', w.id,
      'user_id', w.user_id,
      'created_by', w.created_by,
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
          'is_unilateral', e.is_unilateral,
          'is_alternating', e.is_alternating,
          'side_rest_time', e.side_rest_time,
          'transition_time', e.transition_time,
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
            'is_warmup', s.is_warmup,
            'advanced_config', s.advanced_config
          ) || CASE WHEN s.per_set_method IS NULL THEN '{}'::jsonb
                    ELSE jsonb_build_object('per_set_method', s.per_set_method) END
          ORDER BY s.set_number
        ) AS sets
        FROM sets s
        WHERE s.exercise_id = e.id
      ) s_agg ON true
      WHERE e.workout_id = w.id
    ) ex_agg ON true
    WHERE w.is_template = true AND w.user_id = p_user_id
    ORDER BY w.name
    LIMIT 500
  ) sub;

  -- 2) Sem template: qualquer workout do usuário.
  IF v_workouts = '[]'::jsonb THEN
    SELECT COALESCE(jsonb_agg(w_row ORDER BY w_row->>'name'), '[]'::jsonb)
    INTO v_workouts
    FROM (
      SELECT jsonb_build_object(
        'id', w.id,
        'user_id', w.user_id,
        'created_by', w.created_by,
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
            'is_unilateral', e.is_unilateral,
            'is_alternating', e.is_alternating,
            'side_rest_time', e.side_rest_time,
            'transition_time', e.transition_time,
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
              'is_warmup', s.is_warmup,
              'advanced_config', s.advanced_config
            ) || CASE WHEN s.per_set_method IS NULL THEN '{}'::jsonb
                      ELSE jsonb_build_object('per_set_method', s.per_set_method) END
            ORDER BY s.set_number
          ) AS sets
          FROM sets s
          WHERE s.exercise_id = e.id
        ) s_agg ON true
        WHERE e.workout_id = w.id
      ) ex_agg ON true
      WHERE w.user_id = p_user_id
      ORDER BY w.name
      LIMIT 500
    ) sub;
  END IF;

  -- 3) Ainda vazio: como ALUNO, o template que o professor montou.
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
          'created_by', w.created_by,
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
              'is_unilateral', e.is_unilateral,
              'is_alternating', e.is_alternating,
              'side_rest_time', e.side_rest_time,
              'transition_time', e.transition_time,
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
                'is_warmup', s.is_warmup,
                'advanced_config', s.advanced_config
              ) || CASE WHEN s.per_set_method IS NULL THEN '{}'::jsonb
                        ELSE jsonb_build_object('per_set_method', s.per_set_method) END
              ORDER BY s.set_number
            ) AS sets
            FROM sets s
            WHERE s.exercise_id = e.id
          ) s_agg ON true
          WHERE e.workout_id = w.id
        ) ex_agg ON true
        WHERE w.is_template = true AND (w.user_id = v_student_id OR w.student_id = v_student_id)
        ORDER BY w.name
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
$function$;

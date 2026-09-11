-- A RPC do bootstrap não devolvia `sets.duration_seconds` — e é ela quem serve
-- o plano de treino no caminho normal do app.
--
-- O PR #1126 fechou DUAS das três pontas do campo por-série: a ESCRITA (oito
-- builders, `lib/workout/duracaoDaSerieField.ts`) e cinco SELECTs de leitura.
-- A terceira é esta função, e o guard de payload não a alcança de verdade: ele
-- lê o ARQUIVO da migration, não o banco, e a allowlist apenas PERMITE a chave
-- em vez de exigi-la. Resultado medido no aparelho em 11/09/2026: todo cardio
-- com duração planejada abria com o campo TEMPO vazio e o botão Iniciar
-- desabilitado — ou seja, cardio em blocos simplesmente não funcionava por este
-- caminho.
--
-- Por que urgia mesmo afetando pouca gente hoje: só 2 exercícios de cardio na
-- base inteira tinham `duration_seconds` preenchido, justamente porque o campo
-- vinha sendo APAGADO em toda gravação (o bug que o #1126 corrigiu). Com aquela
-- correção no ar, todo cardio salvo daqui em diante passa a gravar a duração —
-- e aí esta RPC viraria o gargalo para todos.
--
-- ⚠️ Gerada a partir de `pg_get_functiondef` da definição VIVA, nunca do último
-- arquivo do repo: o arquivo de 20260703213937 já esteve ATRÁS do banco (não
-- tinha `is_alternating`) e reaplicá-lo teria regredido a RPC em silêncio.
--
-- O campo entra por CONCATENAÇÃO CONDICIONAL, como o `per_set_method` já fazia:
-- `"duration_seconds": null` em toda série custaria ~28 B × 24 séries do teto
-- por template, numa rota quente que já tem orçamento de payload travado por
-- teste. Série sem duração continua byte a byte igual ao que era.

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
             || CASE WHEN s.duration_seconds IS NULL THEN '{}'::jsonb
                    ELSE jsonb_build_object('duration_seconds', s.duration_seconds) END
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
               || CASE WHEN s.duration_seconds IS NULL THEN '{}'::jsonb
                      ELSE jsonb_build_object('duration_seconds', s.duration_seconds) END
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
                 || CASE WHEN s.duration_seconds IS NULL THEN '{}'::jsonb
                        ELSE jsonb_build_object('duration_seconds', s.duration_seconds) END
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

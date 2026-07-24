-- Migration: adiciona o modo "Alternado" (ex.: rosca alternada) aos exercícios.
--
-- Contexto: o app tinha só bilateral (is_unilateral=false) e unilateral estrito
-- (is_unilateral=true, que dispara descanso "TROCA LADO" entre os lados e exige
-- registrar L e R separados). Um exercício ALTERNADO — alterna rep a rep, mesmo
-- peso, sem descanso entre os lados — não encaixava em nenhum: bilateral conta o
-- volume pela metade (um braço só) e unilateral mete um descanso que não existe.
--
-- Modelagem: coluna booleana ADITIVA `is_alternating` (default false). Precedência
-- resolvida no cliente (alternating vence unilateral). Não toca dados existentes;
-- o código atual ignora o campo extra → backward-compatible.
--
-- Também atualiza as duas RPCs que já carregam is_unilateral, pra is_alternating
-- fluir do banco ao cliente: save_workout_atomic (grava) e get_dashboard_bootstrap
-- (lê). As definições abaixo reproduzem EXATAMENTE as funções em produção
-- (pg_get_functiondef em 2026-07-24), só acrescentando is_alternating.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS is_alternating boolean NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- save_workout_atomic: grava is_alternating no INSERT de exercises.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_workout_atomic(p_workout_id uuid, p_user_id uuid, p_created_by uuid, p_is_template boolean, p_name text, p_notes text, p_exercises jsonb)
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
  v_wiped text;
BEGIN
  IF p_workout_id IS NULL THEN
    INSERT INTO public.workouts (user_id, created_by, is_template, name, notes)
    VALUES (p_user_id, p_created_by, p_is_template, COALESCE(p_name, ''), p_notes)
    RETURNING id INTO v_workout_id;
  ELSE
    v_workout_id := p_workout_id;
    -- Defense-in-depth (auditoria 2026-06-28): espelha a RLS workouts_update_* via auth.uid().
    IF NOT EXISTS (
      SELECT 1 FROM public.workouts w
      WHERE w.id = v_workout_id AND (
        public.is_admin()
        OR w.user_id = auth.uid()
        OR (public.is_teacher_of(w.user_id) AND w.created_by = auth.uid() AND w.is_template = true)
      )
    ) THEN
      RAISE EXCEPTION 'workout_not_found';
    END IF;

    -- Anti-wipe guard (bug "séries mudou sozinho", 2026-07-01): aborta se o payload
    -- zera as séries de um exercício que HOJE tem séries (provável carga parcial).
    SELECT string_agg(oc.k, ', ')
      INTO v_wiped
    FROM (
      SELECT lower(btrim(e.name)) AS k, count(s.id) AS n
      FROM public.exercises e
      LEFT JOIN public.sets s ON s.exercise_id = e.id
      WHERE e.workout_id = v_workout_id
      GROUP BY 1
    ) oc
    JOIN (
      SELECT lower(btrim(ex->>'name')) AS k,
             sum(CASE WHEN jsonb_typeof(ex->'sets') = 'array'
                      THEN jsonb_array_length(ex->'sets') ELSE 0 END) AS n
      FROM jsonb_array_elements(COALESCE(p_exercises, '[]'::jsonb)) ex
      GROUP BY 1
    ) nc ON nc.k = oc.k
    WHERE oc.k <> '' AND oc.n > 0 AND COALESCE(nc.n, 0) = 0;

    IF v_wiped IS NOT NULL AND v_wiped <> '' THEN
      RAISE EXCEPTION 'suspicious_set_wipe: %', v_wiped
        USING HINT = 'Payload zerou as séries de um exercício que possui séries — provável carga parcial. Save abortado para preservar os dados.';
    END IF;

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
      workout_id, name, notes, rest_time, video_url, method, cadence, "order",
      is_unilateral, side_rest_time, transition_time, is_alternating
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
      NULLIF(COALESCE(v_exercise->>'transition_time', ''), '')::int,
      COALESCE((v_exercise->>'is_alternating')::boolean, false)
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
      IF v_set_type = 'warmup' THEN v_is_warmup := true; END IF;

      INSERT INTO public.sets (
        exercise_id, weight, reps, rpe, set_number, completed, is_warmup, set_type, advanced_config
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

-- ─────────────────────────────────────────────────────────────────────────────
-- get_dashboard_bootstrap: retorna is_alternating em cada exercício (3 blocos:
-- template do próprio user, fallback "qualquer", fallback aluno).
-- ─────────────────────────────────────────────────────────────────────────────
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
          ) ORDER BY s.set_number
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
            ) ORDER BY s.set_number
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
              ) ORDER BY s.set_number
            ) AS sets
            FROM sets s
            WHERE s.exercise_id = e.id
          ) s_agg ON true
          WHERE e.workout_id = w.id
        ) ex_agg ON true
        WHERE w.is_template = true
          AND (w.user_id = v_student_id OR w.student_id = v_student_id)
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

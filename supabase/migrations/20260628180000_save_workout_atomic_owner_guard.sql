-- 2ª auditoria de segurança (2026-06-28) — save_workout_atomic sem guard de owner.
--
-- A função é SECURITY INVOKER (RLS já restringe a edição ao dono/professor-template/admin
-- quando chamada pelo client do user), mas o branch de UPDATE não tinha checagem própria
-- de ownership — dependia 100% da RLS. Defesa-em-profundidade: adiciona um guard explícito
-- que ESPELHA a policy workouts_update_* usando auth.uid() (o caller). Protege caso a função
-- vire SECURITY DEFINER no futuro ou ganhe um caller service_role (que bypassa RLS) no branch
-- de UPDATE — hoje o único caller service_role é vip/periodization/create, e só no branch de
-- INSERT (p_workout_id NULL), que não passa por este guard.
--
-- O guard permite: dono (user_id = auth.uid()), admin, ou professor editando template do
-- próprio aluno (is_teacher_of(user_id) AND created_by = auth.uid() AND is_template).
-- Validado contra dados reais: dono/aluno/professor-template -> permitido; estranho -> bloqueado.
-- Dry-run end-to-end como o dono retornou o workout id (não bloqueia save legítimo).
--
-- Também REVOKE anon EXECUTE (least-privilege — anon nunca deve chamar; RLS já bloquearia).
--
-- Rollback: recriar a função sem o bloco "Defense-in-depth" (versão anterior em
-- 20260528110000_exercises_unilateral_rpc.sql).

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
      is_unilateral, side_rest_time, transition_time
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

-- REVOKE do PUBLIC (não só de anon): funções concedem EXECUTE ao PUBLIC por padrão,
-- então revogar só de anon não fecha (anon herda via PUBLIC). Revoga PUBLIC e concede
-- explicitamente aos roles legítimos.
REVOKE EXECUTE ON FUNCTION public.save_workout_atomic(uuid, uuid, uuid, boolean, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workout_atomic(uuid, uuid, uuid, boolean, text, text, jsonb) TO authenticated, service_role;

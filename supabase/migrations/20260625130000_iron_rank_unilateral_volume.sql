-- Iron Rank / Leaderboard: contar exercícios UNILATERAIS no volume.
--
-- Exercícios unilaterais salvam peso/reps por lado em L_weight/R_weight/
-- L_reps/R_reps (o weight/reps do topo fica nulo). As funções de volume liam
-- só o weight/reps do topo, então o unilateral contava 0 — sumia do
-- "kg levantados" (iron_rank_my_total_volume) e do leaderboard global.
--
-- Caminho afetado: apenas o `legacy_by_workout` (sessões salvas como JSON em
-- workouts.notes). 100% das 449 sessões concluídas usam esse caminho — nenhuma
-- tem sets normalizados. 86 sessões têm unilateral subcontado hoje.
--
-- Espelha src/utils/report/setVolume.ts (setVolume): unilateral = L+R somados.

-- Helper: volume de UMA série a partir do log JSON (normal ou unilateral L+R).
CREATE OR REPLACE FUNCTION public.set_volume_from_log(v jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN COALESCE(public.try_parse_numeric(v->>'L_weight'), 0) > 0
      OR COALESCE(public.try_parse_numeric(v->>'R_weight'), 0) > 0
    THEN COALESCE(public.try_parse_numeric(v->>'L_weight'), 0) * COALESCE(public.try_parse_numeric(v->>'L_reps'), 0)
       + COALESCE(public.try_parse_numeric(v->>'R_weight'), 0) * COALESCE(public.try_parse_numeric(v->>'R_reps'), 0)
    ELSE COALESCE(public.try_parse_numeric(v->>'weight'), 0) * COALESCE(public.try_parse_numeric(v->>'reps'), 0)
  END
$function$;

-- 1) "kg levantados" do usuário logado
CREATE OR REPLACE FUNCTION public.iron_rank_my_total_volume()
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  caller_role text := auth.role();
BEGIN
  IF caller IS NULL AND COALESCE(caller_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN COALESCE(
    (
      WITH base_workouts AS (
        SELECT w.id, w.user_id, w.notes
        FROM public.workouts w
        WHERE w.is_template = false
      ),
      sets_by_workout AS (
        SELECT
          bw.id AS workout_id,
          bw.user_id AS uid,
          SUM(COALESCE(s.weight, 0) * COALESCE(public.try_parse_numeric(s.reps::text), 0)) AS volume_kg
        FROM base_workouts bw
        JOIN public.exercises e ON e.workout_id = bw.id
        JOIN public.sets s ON s.exercise_id = e.id
        WHERE COALESCE(s.completed, true) = true
          AND COALESCE(s.weight, 0) > 0
          AND COALESCE(public.try_parse_numeric(s.reps::text), 0) > 0
        GROUP BY bw.id, bw.user_id
      ),
      legacy_by_workout AS (
        SELECT
          bw.id AS workout_id,
          bw.user_id AS uid,
          SUM(public.set_volume_from_log(j.value)) AS volume_kg
        FROM base_workouts bw
        CROSS JOIN LATERAL jsonb_each(COALESCE((public.try_parse_jsonb(bw.notes)->'logs'), '{}'::jsonb)) AS j(key, value)
        WHERE NOT EXISTS (SELECT 1 FROM sets_by_workout sbw WHERE sbw.workout_id = bw.id)
          AND lower(coalesce(j.value->>'done', '')) IN ('true', 't', '1', 'yes', 'y')
          AND public.set_volume_from_log(j.value) > 0
        GROUP BY bw.id, bw.user_id
      ),
      lifted AS (
        SELECT
          x.uid,
          SUM(x.volume_kg) AS total_volume_kg
        FROM (
          SELECT sbw.uid, sbw.volume_kg FROM sets_by_workout sbw
          UNION ALL
          SELECT lbw.uid, lbw.volume_kg FROM legacy_by_workout lbw
        ) x
        GROUP BY x.uid
      )
      SELECT l.total_volume_kg
      FROM lifted l
      WHERE l.uid = caller
    ),
    0
  );
END;
$function$;

-- 2) volume total de um usuário (service_role)
CREATE OR REPLACE FUNCTION public.iron_rank_total_volume_for_user(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  caller_role text := auth.role();
begin
  if coalesce(caller_role, '') <> 'service_role' then
    raise exception 'forbidden';
  end if;

  return coalesce(
    (
      with base_workouts as (
        select w.id, w.notes
        from public.workouts w
        where w.is_template = false and w.user_id = p_user_id
      ),
      sets_by_workout as (
        select bw.id as workout_id,
          sum(coalesce(s.weight, 0) * coalesce(public.try_parse_numeric(s.reps::text), 0)) as volume_kg
        from base_workouts bw
        join public.exercises e on e.workout_id = bw.id
        join public.sets s on s.exercise_id = e.id
        where coalesce(s.completed, true) = true
          and coalesce(s.weight, 0) > 0
          and coalesce(public.try_parse_numeric(s.reps::text), 0) > 0
        group by bw.id
      ),
      legacy_by_workout as (
        select bw.id as workout_id,
          sum(public.set_volume_from_log(j.value)) as volume_kg
        from base_workouts bw
        cross join lateral jsonb_each(coalesce((public.try_parse_jsonb(bw.notes)->'logs'), '{}'::jsonb)) as j(key, value)
        where not exists (select 1 from sets_by_workout sbw where sbw.workout_id = bw.id)
          and lower(coalesce(j.value->>'done', '')) in ('true', 't', '1', 'yes', 'y')
          and public.set_volume_from_log(j.value) > 0
        group by bw.id
      ),
      lifted as (
        select sum(x.volume_kg) as total_volume_kg
        from (
          select volume_kg from sets_by_workout
          union all
          select volume_kg from legacy_by_workout
        ) x
      )
      select l.total_volume_kg from lifted l
    ),
    0
  );
end;
$function$;

-- 3) leaderboard global
CREATE OR REPLACE FUNCTION public.iron_rank_leaderboard(limit_count integer)
 RETURNS TABLE(user_id uuid, display_name text, photo_url text, role text, total_volume_kg numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  caller_role text := auth.role();
  effective_limit int := LEAST(GREATEST(COALESCE(limit_count, 50), 1), 200);
BEGIN
  IF caller IS NULL AND COALESCE(caller_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  WITH base_workouts AS (
    SELECT w.id, w.user_id, w.notes
    FROM public.workouts w
    WHERE w.is_template = false
  ),
  sets_by_workout AS (
    SELECT
      bw.id AS workout_id,
      bw.user_id AS uid,
      SUM(COALESCE(s.weight, 0) * COALESCE(public.try_parse_numeric(s.reps::text), 0)) AS volume_kg
    FROM base_workouts bw
    JOIN public.exercises e ON e.workout_id = bw.id
    JOIN public.sets s ON s.exercise_id = e.id
    WHERE COALESCE(s.completed, true) = true
      AND COALESCE(s.weight, 0) > 0
      AND COALESCE(public.try_parse_numeric(s.reps::text), 0) > 0
    GROUP BY bw.id, bw.user_id
  ),
  legacy_by_workout AS (
    SELECT
      bw.id AS workout_id,
      bw.user_id AS uid,
      SUM(public.set_volume_from_log(j.value)) AS volume_kg
    FROM base_workouts bw
    CROSS JOIN LATERAL jsonb_each(COALESCE((public.try_parse_jsonb(bw.notes)->'logs'), '{}'::jsonb)) AS j(key, value)
    WHERE NOT EXISTS (SELECT 1 FROM sets_by_workout sbw WHERE sbw.workout_id = bw.id)
      AND lower(coalesce(j.value->>'done', '')) IN ('true', 't', '1', 'yes', 'y')
      AND public.set_volume_from_log(j.value) > 0
    GROUP BY bw.id, bw.user_id
  ),
  lifted AS (
    SELECT
      x.uid,
      SUM(x.volume_kg) AS total_volume_kg
    FROM (
      SELECT sbw.uid, sbw.volume_kg FROM sets_by_workout sbw
      UNION ALL
      SELECT lbw.uid, lbw.volume_kg FROM legacy_by_workout lbw
    ) x
    GROUP BY x.uid
  )
  SELECT
    p.id AS user_id,
    p.display_name,
    p.photo_url,
    p.role,
    COALESCE(l.total_volume_kg, 0) AS total_volume_kg
  FROM lifted l
  JOIN public.profiles p ON p.id = l.uid
  WHERE COALESCE(l.total_volume_kg, 0) > 0
  ORDER BY l.total_volume_kg DESC
  LIMIT effective_limit;
END;
$function$;

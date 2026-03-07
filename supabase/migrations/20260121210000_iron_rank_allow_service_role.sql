CREATE OR REPLACE FUNCTION public.iron_rank_leaderboard(limit_count int)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  photo_url text,
  role text,
  total_volume_kg numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
      SUM(public.try_parse_numeric(j.value->>'weight') * public.try_parse_numeric(j.value->>'reps')) AS volume_kg
    FROM base_workouts bw
    CROSS JOIN LATERAL jsonb_each(COALESCE((public.try_parse_jsonb(bw.notes)->'logs'), '{}'::jsonb)) AS j(key, value)
    WHERE NOT EXISTS (SELECT 1 FROM sets_by_workout sbw WHERE sbw.workout_id = bw.id)
      AND lower(coalesce(j.value->>'done', '')) IN ('true', 't', '1', 'yes', 'y')
      AND COALESCE(public.try_parse_numeric(j.value->>'weight'), 0) > 0
      AND COALESCE(public.try_parse_numeric(j.value->>'reps'), 0) > 0
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
$fn$;

REVOKE ALL ON FUNCTION public.iron_rank_leaderboard(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iron_rank_leaderboard(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.iron_rank_leaderboard(int) TO service_role;

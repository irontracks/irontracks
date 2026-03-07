-- IRON RANK leaderboard: compute volume primarily from normalized tables (sets/exercises/workouts).
-- Falls back to legacy workouts.notes->logs only when a workout has no sets.

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
  effective_limit int := LEAST(GREATEST(COALESCE(limit_count, 50), 1), 200);
BEGIN
  IF caller IS NULL THEN
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
      w.id AS workout_id,
      w.user_id,
      SUM(COALESCE(s.weight, 0) * COALESCE(public.try_parse_numeric(s.reps::text), 0)) AS volume_kg
    FROM base_workouts w
    JOIN public.exercises e ON e.workout_id = w.id
    JOIN public.sets s ON s.exercise_id = e.id
    WHERE COALESCE(s.completed, false) = true
    GROUP BY w.id, w.user_id
  ),
  legacy_by_workout AS (
    SELECT
      w.id AS workout_id,
      w.user_id,
      SUM(public.try_parse_numeric(e.value->>'weight') * public.try_parse_numeric(e.value->>'reps')) AS volume_kg
    FROM base_workouts w
    CROSS JOIN LATERAL jsonb_each(COALESCE((public.try_parse_jsonb(w.notes)->'logs'), '{}'::jsonb)) AS e(key, value)
    WHERE NOT EXISTS (SELECT 1 FROM sets_by_workout sbw WHERE sbw.workout_id = w.id)
      AND lower(coalesce(e.value->>'done', '')) IN ('true', 't', '1', 'yes', 'y')
    GROUP BY w.id, w.user_id
  ),
  lifted AS (
    SELECT
      user_id,
      SUM(volume_kg) AS total_volume_kg
    FROM (
      SELECT user_id, volume_kg FROM sets_by_workout
      UNION ALL
      SELECT user_id, volume_kg FROM legacy_by_workout
    ) x
    GROUP BY user_id
  )
  SELECT
    p.id AS user_id,
    p.display_name,
    p.photo_url,
    p.role,
    COALESCE(l.total_volume_kg, 0) AS total_volume_kg
  FROM lifted l
  JOIN public.profiles p ON p.id = l.user_id
  WHERE COALESCE(l.total_volume_kg, 0) > 0
  ORDER BY l.total_volume_kg DESC
  LIMIT effective_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.iron_rank_leaderboard(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iron_rank_leaderboard(int) TO authenticated;

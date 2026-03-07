-- Fix IRON RANK leaderboard RPC: avoid boolean cast exceptions for legacy logs.

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
  WITH workout_logs AS (
    SELECT
      w.user_id,
      (public.try_parse_jsonb(w.notes)->'logs') AS logs
    FROM public.workouts w
    WHERE w.is_template = false
  ),
  lifted AS (
    SELECT
      wl.user_id,
      SUM(
        (
          NULLIF(
            regexp_replace(replace(COALESCE(e.value->>'weight', ''), ',', '.'), '[^0-9\\.\\-]', '', 'g'),
            ''
          )::numeric
          *
          NULLIF(
            regexp_replace(replace(COALESCE(e.value->>'reps', ''), ',', '.'), '[^0-9\\.\\-]', '', 'g'),
            ''
          )::numeric
        )
      ) AS total_volume_kg
    FROM workout_logs wl
    CROSS JOIN LATERAL jsonb_each(COALESCE(wl.logs, '{}'::jsonb)) AS e(key, value)
    WHERE lower(coalesce(e.value->>'done', '')) IN ('true', 't', '1', 'yes', 'y')
    GROUP BY wl.user_id
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

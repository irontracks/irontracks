-- IRON RANK leaderboard RPC
-- Aggregates total lifted volume (kg) per user from workouts.notes JSON logs.
-- Security: SECURITY DEFINER + explicit auth check + minimal columns returned.

-- Helper: safe JSON parse (prevents invalid JSON in notes from breaking the RPC)
CREATE OR REPLACE FUNCTION public.try_parse_jsonb(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_text::jsonb;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$fn$;

-- Overload: if notes is already jsonb in some environments
CREATE OR REPLACE FUNCTION public.try_parse_jsonb(p_json jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT p_json;
$fn$;

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

  -- Notes format (historical workouts): JSON string that contains:
  -- - logs: object keyed by "exerciseIndex-setIndex" with { done, weight, reps, ... }
  -- This RPC sums weight * reps for logs where done = true.
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
    WHERE COALESCE((e.value->>'done')::boolean, false) = true
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

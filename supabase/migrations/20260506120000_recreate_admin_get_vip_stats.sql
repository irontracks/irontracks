-- Migration: recreate_admin_get_vip_stats
-- The function admin_get_vip_stats was created manually in Supabase and never
-- persisted in a migration file. This migration recreates it with the correct
-- implementation so it's reproducible and under version control.
--
-- Returns a JSON array of VipStatsRow:
--   [{ tier, user_count, stats: { chat: {usage, capacity}, insights: {usage, capacity}, wizard: {usage} } }]
--
-- Security: SECURITY DEFINER so it can bypass RLS; internal check enforces
-- that only admin/teacher roles can call it.

CREATE OR REPLACE FUNCTION public.admin_get_vip_stats(
    period_start date DEFAULT (CURRENT_DATE - 6),
    period_end   date DEFAULT CURRENT_DATE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_role text;
  v_result      json;
BEGIN
  -- ── Security guard ───────────────────────────────────────────────────────────
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'teacher') THEN
    RAISE EXCEPTION 'Unauthorized: admin or teacher role required';
  END IF;

  -- ── Main query ───────────────────────────────────────────────────────────────
  WITH
  -- Active paid entitlements: one row per user, best tier wins
  paid_tiers AS (
    SELECT DISTINCT ON (ue.user_id)
      ue.user_id,
      CASE
        WHEN p.role IN ('admin', 'teacher')  THEN 'vip_elite'
        WHEN ue.plan_id ILIKE '%vip_elite%'  THEN 'vip_elite'
        WHEN ue.plan_id ILIKE '%vip_pro%'    THEN 'vip_pro'
        WHEN ue.plan_id ILIKE '%vip_start%'  THEN 'vip_start'
        ELSE 'vip_start'  -- has entitlement but unknown plan → treat as start
      END AS tier
    FROM public.user_entitlements ue
    JOIN public.profiles p ON p.id = ue.user_id
    WHERE ue.status IN ('active', 'trialing', 'past_due')
      AND ue.valid_from <= NOW()
      AND (ue.valid_until IS NULL OR ue.valid_until >= NOW())
    ORDER BY ue.user_id,
      CASE
        WHEN p.role IN ('admin', 'teacher')  THEN 0
        WHEN ue.plan_id ILIKE '%vip_elite%'  THEN 1
        WHEN ue.plan_id ILIKE '%vip_pro%'    THEN 2
        WHEN ue.plan_id ILIKE '%vip_start%'  THEN 3
        ELSE 4
      END
  ),
  -- Admin/teacher users that have no active paid entitlement
  admin_only AS (
    SELECT p.id AS user_id, 'vip_elite'::text AS tier
    FROM public.profiles p
    WHERE p.role IN ('admin', 'teacher')
      AND p.id NOT IN (SELECT user_id FROM paid_tiers)
  ),
  -- Union: all users with a non-free tier
  all_paid AS (
    SELECT user_id, tier FROM paid_tiers
    UNION ALL
    SELECT user_id, tier FROM admin_only
  ),
  -- Total registered users
  total_cnt AS (
    SELECT COUNT(*)::int AS n FROM public.profiles
  ),
  -- Per-tier user counts (free = total minus paid/admin)
  tier_counts AS (
    SELECT tier, COUNT(*)::int AS user_count
    FROM all_paid
    GROUP BY tier

    UNION ALL

    SELECT 'free'::text,
      GREATEST(0, (SELECT n FROM total_cnt) - (SELECT COUNT(*)::int FROM all_paid))
  ),
  -- Usage per tier in the requested period
  tier_usage AS (
    SELECT
      COALESCE(ap.tier, 'free') AS tier,
      ud.feature_key,
      SUM(ud.usage_count)::int  AS total
    FROM public.vip_usage_daily ud
    LEFT JOIN all_paid ap ON ap.user_id = ud.user_id
    WHERE ud.day BETWEEN period_start AND period_end
    GROUP BY COALESCE(ap.tier, 'free'), ud.feature_key
  ),
  -- Per-tier capacity multipliers (mirrors src/utils/vip/limits.ts)
  tier_defs (tier, chat_cap, ins_cap) AS (
    VALUES
      ('free'::text,       5::int,   2::int),
      ('vip_start'::text, 10::int,   3::int),
      ('vip_pro'::text,   40::int,   7::int),
      ('vip_elite'::text,999::int, 999::int)
  )
  SELECT json_agg(
    row_to_json(r)
    ORDER BY CASE r.tier
      WHEN 'vip_elite' THEN 1
      WHEN 'vip_pro'   THEN 2
      WHEN 'vip_start' THEN 3
      ELSE 4
    END
  )
  INTO v_result
  FROM (
    SELECT
      td.tier,
      GREATEST(0, COALESCE(tc.user_count, 0)) AS user_count,
      json_build_object(
        'chat', json_build_object(
          'usage',    COALESCE((
            SELECT total FROM tier_usage
            WHERE tier = td.tier AND feature_key = 'chat'
          ), 0),
          'capacity', td.chat_cap * GREATEST(0, COALESCE(tc.user_count, 0))
        ),
        'insights', json_build_object(
          'usage',    COALESCE((
            SELECT total FROM tier_usage
            WHERE tier = td.tier AND feature_key = 'insights'
          ), 0),
          'capacity', td.ins_cap * GREATEST(0, COALESCE(tc.user_count, 0))
        ),
        'wizard', json_build_object(
          'usage', COALESCE((
            SELECT total FROM tier_usage
            WHERE tier = td.tier AND feature_key = 'wizard'
          ), 0)
        )
      ) AS stats
    FROM tier_defs td
    LEFT JOIN tier_counts tc ON tc.tier = td.tier
  ) r;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- Grant execute to authenticated users (RLS-equivalent check is inside the function)
GRANT EXECUTE ON FUNCTION public.admin_get_vip_stats(date, date) TO authenticated;

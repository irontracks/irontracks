CREATE OR REPLACE FUNCTION admin_get_vip_stats(
  period_start date DEFAULT (now() - interval '7 days')::date,
  period_end date DEFAULT now()::date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  days_count integer;
BEGIN
  -- Security check: only admins can access this function
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Calculate number of days in the period (inclusive)
  days_count := (period_end - period_start) + 1;
  IF days_count <= 0 THEN days_count := 1; END IF;

  WITH 
  -- 1. Identify User Tiers
  user_tiers AS (
    SELECT 
      u.id as user_id,
      COALESCE(sub.plan_id, 'free') as tier
    FROM auth.users u
    LEFT JOIN app_subscriptions sub 
      ON u.id = sub.user_id 
      AND sub.status = 'active'
  ),
  
  -- 2. Count Active Users per Tier
  tier_counts AS (
    SELECT 
      tier,
      count(*) as user_count
    FROM user_tiers
    GROUP BY tier
  ),
  
  -- 3. Aggregate Usage from vip_usage_daily
  usage_agg AS (
    SELECT 
      ut.tier,
      v.feature_key,
      SUM(v.usage_count) as total_usage
    FROM vip_usage_daily v
    JOIN user_tiers ut ON v.user_id = ut.user_id
    WHERE v.day >= period_start AND v.day <= period_end
    GROUP BY ut.tier, v.feature_key
  ),
  
  -- 4. Define Limits per Tier (Hardcoded here or fetched from app_plans if limits column is consistent)
  -- Using hardcoded values matching src/utils/vip/limits.ts for reliability in this report
  tier_limits AS (
    SELECT * FROM (VALUES 
      ('free',      0, 1, 0),    -- chat_daily, insights_weekly, wizard_weekly
      ('vip_start', 10, 3, 1),
      ('vip_pro',   40, 7, 3),
      ('vip_elite', 9999, 9999, 9999)
    ) AS t(tier, limit_chat, limit_insights, limit_wizard)
  )

  SELECT json_agg(
    json_build_object(
      'tier', tc.tier,
      'user_count', tc.user_count,
      'stats', json_build_object(
        'chat', json_build_object(
          'usage', COALESCE((SELECT total_usage FROM usage_agg ua WHERE ua.tier = tc.tier AND ua.feature_key = 'chat_daily'), 0),
          'limit_per_user', tl.limit_chat,
          'capacity', (tc.user_count * tl.limit_chat * days_count)
        ),
        'insights', json_build_object(
          'usage', COALESCE((SELECT total_usage FROM usage_agg ua WHERE ua.tier = tc.tier AND (ua.feature_key = 'insights' OR ua.feature_key = 'insights_weekly')), 0),
          'limit_per_user', tl.limit_insights,
          'capacity', (tc.user_count * tl.limit_insights * GREATEST(1, days_count / 7))
        ),
        'wizard', json_build_object(
          'usage', COALESCE((SELECT total_usage FROM usage_agg ua WHERE ua.tier = tc.tier AND (ua.feature_key = 'wizard' OR ua.feature_key = 'wizard_weekly')), 0),
          'limit_per_user', tl.limit_wizard,
          'capacity', (tc.user_count * tl.limit_wizard * GREATEST(1, days_count / 7))
        )
      )
    )
  ) INTO result
  FROM tier_counts tc
  JOIN tier_limits tl ON tc.tier = tl.tier;

  RETURN result;
END;
$$;

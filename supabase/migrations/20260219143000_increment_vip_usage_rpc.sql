CREATE OR REPLACE FUNCTION increment_vip_usage(
  p_user_id UUID, p_feature_key TEXT, p_day DATE
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO vip_usage_daily(user_id, feature_key, day, usage_count, last_used_at, updated_at)
  VALUES (p_user_id, p_feature_key, p_day, 1, now(), now())
  ON CONFLICT (user_id, feature_key, day)
  DO UPDATE SET
    usage_count = vip_usage_daily.usage_count + 1,
    last_used_at = now(),
    updated_at = now();
END; $$;

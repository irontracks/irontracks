-- Migration: cleanup inactive push tokens (> 90 days not seen)
-- Requires pg_cron extension enabled in Supabase (Settings → Extensions → pg_cron)

-- 1. Manual cleanup function (always available, regardless of pg_cron)
CREATE OR REPLACE FUNCTION cleanup_inactive_push_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM device_push_tokens
  WHERE last_seen_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 2. Schedule nightly cleanup via pg_cron if extension is enabled.
-- NOTE: Do NOT use dollar-quoting inside this DO block — use single quotes only.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not available. Run: SELECT cleanup_inactive_push_tokens()';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('cleanup-inactive-push-tokens');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  PERFORM cron.schedule(
    'cleanup-inactive-push-tokens',
    '0 3 * * *',
    'SELECT cleanup_inactive_push_tokens()'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron scheduling failed: %. Use manual cleanup instead.', SQLERRM;
END;
$do$;

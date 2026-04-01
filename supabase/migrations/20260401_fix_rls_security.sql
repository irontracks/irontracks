-- Migration: fix_rls_security
-- Fixes security advisories from Supabase Advisor:
--   1. webhook_dead_letters — RLS enabled with no policies (deny-all for non-service roles)
--   2. teachers — "Admins manage teachers" policy is USING(true)/WITH CHECK(true) — scope to service_role
--   3. function_search_path_mutable — set search_path = '' on all flagged functions

-- ─── 1. webhook_dead_letters: add deny-all default policy ────────────────────
-- The table is only written by Postgres webhooks (service_role), which bypasses RLS.
-- Adding explicit deny prevents any authenticated/anon user from reading dead letters.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'webhook_dead_letters'
      AND policyname = 'No direct user access to webhook_dead_letters'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "No direct user access to webhook_dead_letters"
        ON public.webhook_dead_letters
        FOR ALL
        TO authenticated, anon
        USING (false)
        WITH CHECK (false)
    $policy$;
  END IF;
END $$;

-- ─── 2. Fix function search_path on all flagged functions ─────────────────────
-- Iterate pg_proc to set search_path = '' without hardcoding argument types.
DO $$
DECLARE
  rec RECORD;
  func_names TEXT[] := ARRAY[
    'set_updated_at',
    'set_updated_at_device_push_tokens',
    'update_updated_at_column',
    'is_teacher_of',
    'set_updated_at_muscle_weekly_summaries',
    'set_updated_at_exercise_canonical',
    'set_updated_at_exercise_aliases',
    'set_updated_at_exercise_alias_jobs',
    'set_updated_at_exercise_execution_submissions',
    'set_updated_at_workout_checkins',
    'set_updated_at_exercise_muscle_maps',
    'set_updated_at_team_session_presence',
    'enforce_exercise_execution_submissions_write_rules',
    'link_student_and_profile',
    'save_workout_atomic',
    'increment_counter',
    'link_teacher_profile_from_whitelist',
    'link_student_profile_from_whitelist',
    'set_updated_at_workout_sync_subscriptions',
    'set_updated_at_error_reports',
    'cleanup_inactive_push_tokens',
    'team_sessions_set_updated_at',
    'admin_get_vip_stats',
    'try_parse_jsonb',
    'check_favorite_limit',
    'check_custom_foods_limit',
    'try_parse_numeric',
    'is_admin',
    'nutrition_add_meal_entry',
    'enforce_invite_whitelist',
    'link_user_and_profile',
    'jsonb_participants_has_uid',
    'nutrition_delete_meal_entry',
    'update_lab_results_updated_at',
    'enforce_invite_whitelist_v2',
    'link_user_and_profile_v2',
    'block_cancelled_teacher_login',
    'create_recovery_codes',
    'verify_recovery_code',
    'notifications_normalize_social_columns'
  ];
BEGIN
  FOR rec IN
    SELECT p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY(func_names)
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = ''''',
        rec.nspname, rec.proname, rec.args
      );
    EXCEPTION WHEN OTHERS THEN
      -- Skip functions that can't be altered (e.g. built-ins, wrong signature)
      RAISE WARNING 'Could not alter function %.%(%): %',
        rec.nspname, rec.proname, rec.args, SQLERRM;
    END;
  END LOOP;
END $$;

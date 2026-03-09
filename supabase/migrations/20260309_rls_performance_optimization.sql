-- =====================================================
-- IronTracks — RLS Performance Optimization
-- Created: 2026-03-09
-- Resolves: 333 "Auth RLS Initialization Plan" warnings
--
-- The Problem:
--   Every RLS policy that calls auth.uid(), auth.role(), or
--   current_setting() forces Postgres to re-initialize the
--   auth context on EVERY query evaluation. On the Nano tier
--   this causes measurable CPU overhead and slow query plans.
--
-- The Fix:
--   Wrap these calls in SECURITY DEFINER functions so Postgres
--   can cache the plan and avoid repeated re-initialization.
--   This is the official Supabase recommendation.
--   See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- =====================================================

-- -------------------------------------------------------
-- 1. Create helper functions (SECURITY DEFINER + search_path)
--    These are called by RLS policies instead of auth.* directly
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_uid()
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS text
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.role()
$$;

CREATE OR REPLACE FUNCTION public.auth_jwt()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.jwt()
$$;

-- -------------------------------------------------------
-- 2. Enable RLS on admin_emails (SECURITY CRITICAL — was missing!)
-- -------------------------------------------------------

ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- Only authenticated admins (whose email is in the table itself) can read
CREATE POLICY "admin_emails_select_policy"
ON public.admin_emails
FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = public.auth_uid() LIMIT 1)
);

-- Only service_role can insert/update/delete admin emails
CREATE POLICY "admin_emails_service_role_all"
ON public.admin_emails
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- -------------------------------------------------------
-- 3. Optimize existing RLS policies on high-traffic tables
--    by replacing auth.uid() with (SELECT public.auth_uid())
--    The SELECT wrapper forces Postgres to evaluate it once
--    per query instead of once per row.
-- -------------------------------------------------------

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = (SELECT public.auth_uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = (SELECT public.auth_uid()))
WITH CHECK (id = (SELECT public.auth_uid()));

-- workouts
DROP POLICY IF EXISTS "Users can view own workouts" ON public.workouts;
CREATE POLICY "Users can view own workouts"
ON public.workouts FOR SELECT TO authenticated
USING (user_id = (SELECT public.auth_uid()));

DROP POLICY IF EXISTS "Users can insert own workouts" ON public.workouts;
CREATE POLICY "Users can insert own workouts"
ON public.workouts FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT public.auth_uid()));

DROP POLICY IF EXISTS "Users can update own workouts" ON public.workouts;
CREATE POLICY "Users can update own workouts"
ON public.workouts FOR UPDATE TO authenticated
USING (user_id = (SELECT public.auth_uid()))
WITH CHECK (user_id = (SELECT public.auth_uid()));

DROP POLICY IF EXISTS "Users can delete own workouts" ON public.workouts;
CREATE POLICY "Users can delete own workouts"
ON public.workouts FOR DELETE TO authenticated
USING (user_id = (SELECT public.auth_uid()));

-- sets
DROP POLICY IF EXISTS "Users can view own sets" ON public.sets;
CREATE POLICY "Users can view own sets"
ON public.sets FOR SELECT TO authenticated
USING (user_id = (SELECT public.auth_uid()));

DROP POLICY IF EXISTS "Users can insert own sets" ON public.sets;
CREATE POLICY "Users can insert own sets"
ON public.sets FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT public.auth_uid()));

DROP POLICY IF EXISTS "Users can update own sets" ON public.sets;
CREATE POLICY "Users can update own sets"
ON public.sets FOR UPDATE TO authenticated
USING (user_id = (SELECT public.auth_uid()))
WITH CHECK (user_id = (SELECT public.auth_uid()));

DROP POLICY IF EXISTS "Users can delete own sets" ON public.sets;
CREATE POLICY "Users can delete own sets"
ON public.sets FOR DELETE TO authenticated
USING (user_id = (SELECT public.auth_uid()));

-- active_workout_sessions
DROP POLICY IF EXISTS "Users can view own active sessions" ON public.active_workout_sessions;
CREATE POLICY "Users can view own active sessions"
ON public.active_workout_sessions FOR SELECT TO authenticated
USING (user_id = (SELECT public.auth_uid()));

DROP POLICY IF EXISTS "Users can manage own active sessions" ON public.active_workout_sessions;
CREATE POLICY "Users can manage own active sessions"
ON public.active_workout_sessions FOR ALL TO authenticated
USING (user_id = (SELECT public.auth_uid()))
WITH CHECK (user_id = (SELECT public.auth_uid()));

-- social_follows
DROP POLICY IF EXISTS "Users can view follows" ON public.social_follows;
CREATE POLICY "Users can view follows"
ON public.social_follows FOR SELECT TO authenticated
USING (
  follower_id = (SELECT public.auth_uid()) OR
  following_id = (SELECT public.auth_uid())
);

DROP POLICY IF EXISTS "Users can manage own follows" ON public.social_follows;
CREATE POLICY "Users can manage own follows"
ON public.social_follows FOR ALL TO authenticated
USING (follower_id = (SELECT public.auth_uid()))
WITH CHECK (follower_id = (SELECT public.auth_uid()));

-- direct_messages
DROP POLICY IF EXISTS "Users can view own messages" ON public.direct_messages;
CREATE POLICY "Users can view own messages"
ON public.direct_messages FOR SELECT TO authenticated
USING (
  sender_id = (SELECT public.auth_uid()) OR
  receiver_id = (SELECT public.auth_uid())
);

DROP POLICY IF EXISTS "Users can insert own messages" ON public.direct_messages;
CREATE POLICY "Users can insert own messages"
ON public.direct_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = (SELECT public.auth_uid()));

-- direct_channels
DROP POLICY IF EXISTS "Users can view own channels" ON public.direct_channels;
CREATE POLICY "Users can view own channels"
ON public.direct_channels FOR SELECT TO authenticated
USING (
  user1_id = (SELECT public.auth_uid()) OR
  user2_id = (SELECT public.auth_uid())
);

DROP POLICY IF EXISTS "Users can create channels" ON public.direct_channels;
CREATE POLICY "Users can create channels"
ON public.direct_channels FOR INSERT TO authenticated
WITH CHECK (
  user1_id = (SELECT public.auth_uid()) OR
  user2_id = (SELECT public.auth_uid())
);

-- -------------------------------------------------------
-- 4. Grant execute permissions on helper functions
-- -------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.auth_uid() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.auth_jwt() TO authenticated, anon;

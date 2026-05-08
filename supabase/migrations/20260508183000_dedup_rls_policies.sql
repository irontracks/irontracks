-- Drop RLS policies that are strictly redundant with another already in place.
--
-- Context: Supabase advisor flagged 15 tables with multiple permissive
-- policies for the same command. PERMISSIVE policies are OR-combined, so a
-- redundant policy doesn't change access semantics — it just costs an extra
-- predicate evaluation per row. Each DROP below was hand-checked against the
-- remaining policies on the same (table, cmd, role) and verified to be a
-- proper subset (or identical) of one that survives.
--
-- See chat audit (2026-05-08) for the comparison table.

-- ── profiles ───────────────────────────────────────────────────────────
-- "Users can insert own profile" (public, with_check auth.uid()=id) is
-- equivalent to profiles_insert_own (authenticated, with_check id=(SELECT auth_uid())).
-- The latter is strictly better: tighter role + cached auth_uid().
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- profiles_update_self (public, qual auth.uid()=id) is equivalent to
-- profiles_update_own (authenticated, qual id=(SELECT auth_uid())). Same logic.
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;

-- profiles_select_own restricts SELECT to id=(SELECT auth_uid()) but the
-- already-existing profiles_read_all_authenticated has qual=true on the same
-- (authenticated) role — every row is allowed regardless of _select_own.
-- Dropping changes nothing.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

-- ── workouts ───────────────────────────────────────────────────────────
-- "Users can delete their own workouts" (auth.uid() = user_id) is the
-- non-optimized equivalent of workouts_delete_own (user_id = (SELECT auth_uid())).
-- workouts_delete_silo handles admin/teacher cases independently.
DROP POLICY IF EXISTS "Users can delete their own workouts" ON public.workouts;

-- Same story for UPDATE.
DROP POLICY IF EXISTS "Users can update their own workouts" ON public.workouts;

-- ── invites ────────────────────────────────────────────────────────────
-- "Users manage invites" is an ALL policy that already covers SELECT/UPDATE
-- with the same predicate (from_uid OR to_uid = auth.uid()). The split
-- per-cmd policies below were strict subsets.
DROP POLICY IF EXISTS "Users can see invites" ON public.invites;
DROP POLICY IF EXISTS "Users can update invites" ON public.invites;

-- ── photos ─────────────────────────────────────────────────────────────
-- "Users manage own photos" (qual auth.uid()=user_id, no with_check) is
-- equivalent to photos_own (qual + with_check auth.uid()=user_id) — the
-- latter being more explicit. Drop the looser one.
DROP POLICY IF EXISTS "Users manage own photos" ON public.photos;

-- ── social_follows ─────────────────────────────────────────────────────
-- _delete_own restricts DELETE to follower_id = auth.uid().
-- _delete_participants permits follower_id OR following_id = auth.uid()
-- (a strict superset). _delete_own is therefore redundant.
DROP POLICY IF EXISTS social_follows_delete_own ON public.social_follows;

-- _insert_follower and _insert_own have identical semantics (follower_id =
-- auth.uid()), the latter using the optimized (SELECT auth_uid()) form.
DROP POLICY IF EXISTS social_follows_insert_follower ON public.social_follows;

-- _select and _select_participants are functionally identical (follower OR
-- following = auth.uid()). Keep the optimized one.
DROP POLICY IF EXISTS social_follows_select_participants ON public.social_follows;

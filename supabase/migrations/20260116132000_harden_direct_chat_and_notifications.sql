-- Harden direct chat RPC + RLS, and respect notification preferences
-- Goal:
-- - Prevent SECURITY DEFINER RPC abuse (calling on behalf of other users)
-- - Reduce DM spam by enforcing opt-out via user_settings.preferences
-- - Avoid search_path hijacking inside SECURITY DEFINER functions
-- - Optionally filter invite notifications based on allowTeamInvites

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Canonical ordering guard for direct_channels (forward-safe)
-- ---------------------------------------------------------------------
-- NOTE: NOT VALID avoids migration failure if historical rows are non-canonical.
-- New inserts/updates will be enforced.
ALTER TABLE public.direct_channels
  ADD CONSTRAINT IF NOT EXISTS direct_channels_user_order_chk
  CHECK (user1_id < user2_id) NOT VALID;

-- ---------------------------------------------------------------------
-- 2) DM permission helper (pair-safe, avoids leaking other users settings)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_dm_pair(p_user1 uuid, p_user2 uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  caller uuid := auth.uid();
  other uuid;
  caller_ok boolean;
  other_ok boolean;
BEGIN
  IF caller IS NULL THEN
    RETURN false;
  END IF;

  IF p_user1 IS NULL OR p_user2 IS NULL OR p_user1 = p_user2 THEN
    RETURN false;
  END IF;

  -- Only the participant can ask/act for this pair.
  IF caller <> p_user1 AND caller <> p_user2 THEN
    RETURN false;
  END IF;

  IF public.is_admin() THEN
    RETURN true;
  END IF;

  other := CASE WHEN caller = p_user1 THEN p_user2 ELSE p_user1 END;

  -- Preference key (flat, aligns with user_settings hook): allowDirectMessages
  SELECT COALESCE((us.preferences->>'allowDirectMessages')::boolean, true)
    INTO caller_ok
  FROM public.user_settings us
  WHERE us.user_id = caller;

  SELECT COALESCE((us.preferences->>'allowDirectMessages')::boolean, true)
    INTO other_ok
  FROM public.user_settings us
  WHERE us.user_id = other;

  RETURN COALESCE(caller_ok, true) AND COALESCE(other_ok, true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.can_dm_pair(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_dm_pair(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Tighten RLS for direct_channels / direct_messages
-- ---------------------------------------------------------------------
ALTER TABLE public.direct_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- direct_channels
DROP POLICY IF EXISTS "Users can view their own channels" ON public.direct_channels;
CREATE POLICY direct_channels_select_participants
ON public.direct_channels
FOR SELECT
TO authenticated
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

DROP POLICY IF EXISTS "Users can create channels" ON public.direct_channels;
CREATE POLICY direct_channels_insert_participants
ON public.direct_channels
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.uid() = user1_id OR auth.uid() = user2_id)
  AND user1_id < user2_id
  AND public.can_dm_pair(user1_id, user2_id)
);

-- direct_messages
DROP POLICY IF EXISTS "Users can view messages from their channels" ON public.direct_messages;
CREATE POLICY direct_messages_select_participants
ON public.direct_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.direct_channels dc
    WHERE dc.id = direct_messages.channel_id
      AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can send messages to their channels" ON public.direct_messages;
CREATE POLICY direct_messages_insert_participants
ON public.direct_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.direct_channels dc
    WHERE dc.id = direct_messages.channel_id
      AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
      AND public.can_dm_pair(dc.user1_id, dc.user2_id)
  )
);

-- Keep the existing UPDATE policy from 20241220154000_direct_messages_update_policy.sql

-- ---------------------------------------------------------------------
-- 4) Harden SECURITY DEFINER RPCs (auth checks + search_path)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_direct_channel(user1 uuid, user2 uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  caller uuid := auth.uid();
  channel_id uuid;
  ordered_user1 uuid;
  ordered_user2 uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF user1 IS NULL OR user2 IS NULL OR user1 = user2 THEN
    RAISE EXCEPTION 'invalid_users';
  END IF;

  -- Block creating channels on behalf of other users.
  IF caller <> user1 AND caller <> user2 THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.can_dm_pair(user1, user2) THEN
    RAISE EXCEPTION 'dm_blocked';
  END IF;

  ordered_user1 := LEAST(user1, user2);
  ordered_user2 := GREATEST(user1, user2);

  -- Try to find existing channel
  SELECT dc.id
    INTO channel_id
  FROM public.direct_channels dc
  WHERE dc.user1_id = ordered_user1
    AND dc.user2_id = ordered_user2;

  -- If not found, create new channel
  IF channel_id IS NULL THEN
    INSERT INTO public.direct_channels (user1_id, user2_id)
    VALUES (ordered_user1, ordered_user2)
    RETURNING id INTO channel_id;
  END IF;

  RETURN channel_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_or_create_direct_channel(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_channel(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_conversations(user_id uuid)
RETURNS TABLE (
  channel_id uuid,
  other_user_id uuid,
  other_user_name text,
  other_user_photo text,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint,
  is_online boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  caller uuid := auth.uid();
  effective_user uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  effective_user := COALESCE(user_id, caller);
  IF effective_user <> caller THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    dc.id,
    CASE WHEN dc.user1_id = effective_user THEN dc.user2_id ELSE dc.user1_id END AS other_user_id,
    p.display_name AS other_user_name,
    p.photo_url AS other_user_photo,
    dm_last.content AS last_message,
    dm_last.created_at AS last_message_at,
    COALESCE(unread.count, 0) AS unread_count,
    p.last_seen > now() - interval '5 minutes' AS is_online
  FROM public.direct_channels AS dc
  LEFT JOIN LATERAL (
    SELECT dm.content, dm.created_at, dm.sender_id
    FROM public.direct_messages AS dm
    WHERE dm.channel_id = dc.id
    ORDER BY dm.created_at DESC
    LIMIT 1
  ) AS dm_last ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS count
    FROM public.direct_messages AS dm2
    WHERE dm2.channel_id = dc.id
      AND dm2.sender_id <> effective_user
      AND dm2.is_read = false
  ) AS unread ON true
  JOIN public.profiles AS p
    ON p.id = CASE WHEN dc.user1_id = effective_user THEN dc.user2_id ELSE dc.user1_id END
  WHERE (dc.user1_id = effective_user OR dc.user2_id = effective_user)
  ORDER BY COALESCE(dm_last.created_at, dc.created_at) DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_user_conversations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_conversations(uuid) TO authenticated;

-- Dedupe is destructive; restrict to service_role/admin.
CREATE OR REPLACE FUNCTION public.dedupe_direct_channels()
RETURNS TABLE (pairs_affected bigint, channels_deduped bigint, messages_moved bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  moved bigint := 0;
  dedup bigint := 0;
  affected bigint := 0;
  rec record;
  dup uuid;
  canon uuid;
  cnt bigint;
  jwt_role text := auth.role();
BEGIN
  IF COALESCE(jwt_role, '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR rec IN (
    SELECT LEAST(user1_id, user2_id) AS u1,
           GREATEST(user1_id, user2_id) AS u2,
           array_agg(id ORDER BY created_at ASC) AS ids
    FROM public.direct_channels
    GROUP BY LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id)
    HAVING count(*) > 1
  ) LOOP
    affected := affected + 1;
    canon := rec.ids[1];
    FOR i IN 2 .. array_length(rec.ids, 1) LOOP
      dup := rec.ids[i];
      UPDATE public.direct_messages SET channel_id = canon WHERE channel_id = dup;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      moved := moved + cnt;

      DELETE FROM public.direct_channels WHERE id = dup;
      GET DIAGNOSTICS cnt = ROW_COUNT;
      dedup := dedup + cnt;
    END LOOP;
  END LOOP;

  PERFORM 1 FROM pg_indexes WHERE indexname = 'uniq_direct_pair_idx';
  IF NOT FOUND THEN
    EXECUTE 'CREATE UNIQUE INDEX uniq_direct_pair_idx ON public.direct_channels (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id))';
  END IF;

  RETURN QUERY SELECT affected, dedup, moved;
END;
$fn$;

REVOKE ALL ON FUNCTION public.dedupe_direct_channels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dedupe_direct_channels() TO service_role;

-- ---------------------------------------------------------------------
-- 5) Notification preference: skip invite notifications when disabled
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invites_create_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  sender_name text;
  workout_title text;
  allow_team_invites boolean;
BEGIN
  IF NEW.to_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, 'pending') <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- Respect user preference (default true if missing)
  SELECT COALESCE((us.preferences->>'allowTeamInvites')::boolean, true)
    INTO allow_team_invites
  FROM public.user_settings us
  WHERE us.user_id = NEW.to_uid;

  IF COALESCE(allow_team_invites, true) = false THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.display_name, '')
    INTO sender_name
  FROM public.profiles p
  WHERE p.id = NEW.from_uid;

  workout_title := COALESCE(NEW.workout_data->>'title', NEW.workout_data->>'name', 'Treino');

  INSERT INTO public.notifications(user_id, title, message, type)
  VALUES (
    NEW.to_uid,
    CASE
      WHEN sender_name <> '' THEN ('Convite de ' || sender_name)
      ELSE 'Convite de treino'
    END,
    'Convite para treinar: ' || workout_title,
    'invite'
  );

  RETURN NEW;
END;
$fn$;

COMMIT;


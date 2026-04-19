-- Follow-up to 20260418160000 security hardening.
-- Closes residual RLS vectors discovered in post-change code review.

-- ── messages: drop the two "always true / user_id only" permissive policies.
-- Both are duplicated by more restrictive ones that validate channel membership.
-- RLS unions PERMISSIVE policies with OR, so leaving the loose ones in place
-- effectively bypasses the membership check.

-- SELECT: "Everyone can read messages" had USING (true) — leaked every DM.
DROP POLICY IF EXISTS "Everyone can read messages" ON public.messages;

-- INSERT: "Users can insert messages" had WITH CHECK (auth.uid() = user_id)
-- with no channel check — allowed any user to inject messages into any channel.
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;

-- ── chat_invites UPDATE: add WITH CHECK so receiver can only transition to
-- accepted/rejected and cannot change sender_id / receiver_id / other columns.
DROP POLICY IF EXISTS chat_invites_update_receiver ON public.chat_invites;
CREATE POLICY chat_invites_update_receiver
  ON public.chat_invites
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id AND status IN ('accepted', 'rejected'));

-- ── chat_members: add standalone index on user_id so users_share_private_channel
-- and any other per-user lookup doesn't scan the whole table.
CREATE INDEX IF NOT EXISTS idx_chat_members_user_id
  ON public.chat_members (user_id);

-- ── notifications: drop duplicate SELECT policy (identical to "User read own").
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;

-- ── accept_chat_invite: add self-invite guard. If sender_id = receiver_id
-- (somehow created in the past), reject cleanly instead of colliding on the
-- chat_members PK (channel_id, user_id).
CREATE OR REPLACE FUNCTION public.accept_chat_invite(p_invite_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite     RECORD;
  v_channel_id uuid;
  v_caller     uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT id, sender_id, receiver_id, status
    INTO v_invite
    FROM public.chat_invites
   WHERE id = p_invite_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;

  IF v_invite.receiver_id <> v_caller THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_invite.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITE_NOT_PENDING';
  END IF;

  IF v_invite.sender_id = v_invite.receiver_id THEN
    RAISE EXCEPTION 'SELF_INVITE';
  END IF;

  INSERT INTO public.chat_channels (type) VALUES ('private')
  RETURNING id INTO v_channel_id;

  INSERT INTO public.chat_members (channel_id, user_id) VALUES
    (v_channel_id, v_caller),
    (v_channel_id, v_invite.sender_id);

  UPDATE public.chat_invites
     SET status = 'accepted', updated_at = now()
   WHERE id = p_invite_id;

  RETURN v_channel_id;
END;
$$;

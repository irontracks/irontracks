-- RPC: accept_chat_invite — atomically validate invite, create private channel,
-- add both members, mark invite accepted. SECURITY DEFINER bypasses RLS safely
-- because the function validates auth.uid() = invite.receiver_id.
--
-- Replaces the previous client-side flow (3 separate inserts from the browser)
-- which required chat_members RLS to allow INSERT for any user_id — a data
-- leak vector where a user could add themselves to another user's private
-- channel by guessing the channel_id.

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

REVOKE ALL ON FUNCTION public.accept_chat_invite(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_chat_invite(uuid) TO authenticated;

-- Tighten chat_members INSERT: user can only add themselves. The RPC above
-- bypasses this via SECURITY DEFINER for the invite-acceptance flow.
DROP POLICY IF EXISTS "Authenticated users can insert members" ON public.chat_members;
CREATE POLICY "Users can add themselves to channels"
  ON public.chat_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Helper RPC: returns true if two users already share a private chat channel.
-- Used to authorize in-app notifications (direct-message) so that one user
-- cannot spam notifications to arbitrary user_ids.

CREATE OR REPLACE FUNCTION public.users_share_private_channel(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.chat_channels c
      JOIN public.chat_members ma ON ma.channel_id = c.id AND ma.user_id = p_a
      JOIN public.chat_members mb ON mb.channel_id = c.id AND mb.user_id = p_b
     WHERE c.type = 'private'
  );
$$;

REVOKE ALL ON FUNCTION public.users_share_private_channel(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.users_share_private_channel(uuid, uuid) TO authenticated, service_role;

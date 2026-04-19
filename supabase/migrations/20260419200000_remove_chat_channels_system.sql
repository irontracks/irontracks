-- Remove the dead chat_channels system (Issue #55).
--
-- Context:
--   - public.chat_channels / chat_members / messages / chat_invites had 0
--     private channels, 0 chat_members, and 3 legacy messages in 2 global
--     channels across the entire prod history.
--   - The live chat system uses direct_channels + direct_messages (teacher ↔
--     student inbox via /api/teacher/inbox/*), with 10 channels and 23
--     messages.
--   - Keeping the dead system created dormant bugs (.select('id') on
--     chat_members which has no id column — see #55) and extra RLS surface.
--
-- Preservation:
--   - users_share_private_channel(uuid, uuid) stays, but is rewritten to
--     check direct_channels (the actually-active system). /api/notifications/
--     direct-message calls this RPC to gate in-app DM notifications.
--
-- Order of ops (single transaction):
--   1. Rewrite users_share_private_channel to use direct_channels
--   2. Drop accept_chat_invite RPC (orphan after ChatScreen removal)
--   3. Drop chat_invites (references chat_members... no wait it doesn't; just
--      has its own sender_id/receiver_id UUIDs)
--   4. Drop messages (references chat_channels via channel_id)
--   5. Drop chat_members (references chat_channels via channel_id)
--   6. Drop chat_channels

-- ── 1. Rewrite users_share_private_channel to check direct_channels ─────────
CREATE OR REPLACE FUNCTION public.users_share_private_channel(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.direct_channels
     WHERE (user1_id = p_a AND user2_id = p_b)
        OR (user1_id = p_b AND user2_id = p_a)
  );
$$;

-- GRANT is preserved from the original definition (authenticated + service_role).
-- CREATE OR REPLACE doesn't reset grants.

-- ── 2. Drop accept_chat_invite RPC ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public.accept_chat_invite(uuid);

-- ── 3. Drop the 4 dead tables (RLS policies cascade with the table) ─────────
DROP TABLE IF EXISTS public.chat_invites CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.chat_members CASCADE;
DROP TABLE IF EXISTS public.chat_channels CASCADE;

-- Note on the 3 legacy messages in global chat: they're lost with this drop.
-- Acceptable because the feature was never really used (3 messages total,
-- no user complaints on record).

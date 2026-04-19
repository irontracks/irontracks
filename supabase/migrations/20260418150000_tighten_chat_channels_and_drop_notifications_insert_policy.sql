-- Tighten RLS on chat_channels and remove redundant notifications INSERT policy.
--
-- chat_channels: previously allowed any authenticated user to INSERT any type,
-- including 'global'. Global channels should only be created server-side via
-- service_role (see /api/chat/global-id). Restrict client INSERTs to private
-- channels only.
--
-- notifications: the "Admins can insert notifications" policy was misleadingly
-- named — it granted INSERT to role `public` with WITH CHECK (true), which
-- allowed any anon-key holder to insert notifications for any user_id (spam /
-- phishing vector). All legitimate notification INSERTs go through service_role
-- routes, so this policy is redundant. Drop it. Authenticated users keep
-- SELECT/UPDATE on their own notifications via the "User manage own" policy.

DROP POLICY IF EXISTS "Authenticated users can create channels" ON public.chat_channels;
CREATE POLICY "Authenticated users can create private channels"
  ON public.chat_channels
  FOR INSERT
  TO authenticated
  WITH CHECK (type = 'private');

DROP POLICY IF EXISTS "Admins can insert notifications" ON public.notifications;

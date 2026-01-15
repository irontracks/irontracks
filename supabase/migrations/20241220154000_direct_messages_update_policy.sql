-- Allow participants to mark messages as read
DROP POLICY IF EXISTS "direct_messages_update_participants" ON direct_messages;
CREATE POLICY "direct_messages_update_participants"
ON direct_messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM direct_channels dc
    WHERE dc.id = direct_messages.channel_id
      AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM direct_channels dc
    WHERE dc.id = direct_messages.channel_id
      AND (dc.user1_id = auth.uid() OR dc.user2_id = auth.uid())
  )
);


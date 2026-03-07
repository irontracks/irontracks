ALTER TABLE chat_invites DROP CONSTRAINT IF EXISTS chat_invites_sender_id_receiver_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS chat_invites_unique_pending ON chat_invites(sender_id, receiver_id) WHERE status = 'pending';
CREATE POLICY "chat_invites_delete_sender_pending" ON chat_invites FOR DELETE TO authenticated USING (auth.uid() = sender_id AND status = 'pending');


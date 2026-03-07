-- Normalize chat_invites policies (ID-based) and ensure realtime

-- Enable RLS (idempotent)
ALTER TABLE chat_invites ENABLE ROW LEVEL SECURITY;

-- Drop legacy/email-based policies if exist
DROP POLICY IF EXISTS "Users can view invites they sent" ON chat_invites;
DROP POLICY IF EXISTS "Users can view invites sent to their email" ON chat_invites;
DROP POLICY IF EXISTS "Users can insert invites" ON chat_invites;
DROP POLICY IF EXISTS "Users can update invites sent to their email" ON chat_invites;
DROP POLICY IF EXISTS "View invites involved in" ON chat_invites;
DROP POLICY IF EXISTS "Create invites as sender" ON chat_invites;
DROP POLICY IF EXISTS "Update received invites" ON chat_invites;

-- Simple, robust ID-based policies
CREATE POLICY "chat_invites_select_involved"
ON chat_invites FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "chat_invites_insert_sender"
ON chat_invites FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "chat_invites_update_receiver"
ON chat_invites FOR UPDATE TO authenticated
USING (auth.uid() = receiver_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS chat_invites_receiver_idx ON chat_invites(receiver_id);
CREATE INDEX IF NOT EXISTS chat_invites_sender_idx ON chat_invites(sender_id);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_invites_set_updated_at ON chat_invites;
CREATE TRIGGER chat_invites_set_updated_at
BEFORE UPDATE ON chat_invites
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Ensure realtime publication contains chat_invites
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_invites;
  END IF;
END $$;


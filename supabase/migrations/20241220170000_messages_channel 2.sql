-- Add channel_id to global messages and backfill
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_id UUID;
ALTER TABLE messages ADD CONSTRAINT messages_channel_fk FOREIGN KEY (channel_id) REFERENCES chat_channels(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id);

DO $$
DECLARE
  g UUID;
BEGIN
  SELECT id INTO g FROM chat_channels WHERE type = 'global' LIMIT 1;
  IF g IS NULL THEN
    INSERT INTO chat_channels(type) VALUES('global') RETURNING id INTO g;
  END IF;
  UPDATE messages SET channel_id = g WHERE channel_id IS NULL;
END $$;


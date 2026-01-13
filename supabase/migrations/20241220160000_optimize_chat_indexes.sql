-- Optimize indexes for direct chat

-- Composite index to speed up channel pagination by created_at
CREATE INDEX IF NOT EXISTS idx_direct_messages_channel_created_desc
ON direct_messages(channel_id, created_at DESC);

-- Last message ordering for channels per user
CREATE INDEX IF NOT EXISTS idx_direct_channels_user1_last
ON direct_channels(user1_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_channels_user2_last
ON direct_channels(user2_id, last_message_at DESC);


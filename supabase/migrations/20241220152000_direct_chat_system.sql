-- Migration: Create new direct chat system without invites
-- This replaces the old invite-based system with direct 1:1 channels

-- 1. Create channels table for direct 1:1 conversations
CREATE TABLE IF NOT EXISTS direct_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user1_id, user2_id)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_direct_channels_user1 ON direct_channels(user1_id);
CREATE INDEX IF NOT EXISTS idx_direct_channels_user2 ON direct_channels(user2_id);
CREATE INDEX IF NOT EXISTS idx_direct_channels_last_message ON direct_channels(last_message_at DESC);

-- 2. Create messages table for direct chat
CREATE TABLE IF NOT EXISTS direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES direct_channels(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_direct_messages_channel ON direct_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_created ON direct_messages(created_at DESC);

-- 3. Enable RLS
ALTER TABLE direct_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for direct_channels
CREATE POLICY "Users can view their own channels" ON direct_channels FOR SELECT USING (
    auth.uid() = user1_id OR auth.uid() = user2_id
);

CREATE POLICY "Users can create channels" ON direct_channels FOR INSERT WITH CHECK (
    auth.uid() = user1_id OR auth.uid() = user2_id
);

-- 5. Create RLS policies for direct_messages
CREATE POLICY "Users can view messages from their channels" ON direct_messages FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM direct_channels
        WHERE direct_channels.id = direct_messages.channel_id
        AND (direct_channels.user1_id = auth.uid() OR direct_channels.user2_id = auth.uid())
    )
);

CREATE POLICY "Users can send messages to their channels" ON direct_messages FOR INSERT
WITH CHECK (
    sender_id = auth.uid() AND 
    EXISTS (
        SELECT 1 FROM direct_channels
        WHERE direct_channels.id = channel_id
        AND (direct_channels.user1_id = auth.uid() OR direct_channels.user2_id = auth.uid())
    )
);

-- 6. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE direct_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;

-- 7. Function to get or create channel between two users
CREATE OR REPLACE FUNCTION get_or_create_direct_channel(user1 UUID, user2 UUID)
RETURNS UUID AS $$
DECLARE
    channel_id UUID;
    ordered_user1 UUID;
    ordered_user2 UUID;
BEGIN
    -- Ensure consistent ordering
    IF user1 < user2 THEN
        ordered_user1 := user1;
        ordered_user2 := user2;
    ELSE
        ordered_user1 := user2;
        ordered_user2 := user1;
    END IF;

    -- Try to find existing channel
    SELECT id INTO channel_id
    FROM direct_channels
    WHERE user1_id = ordered_user1 AND user2_id = ordered_user2;

    -- If not found, create new channel
    IF channel_id IS NULL THEN
        INSERT INTO direct_channels (user1_id, user2_id)
        VALUES (ordered_user1, ordered_user2)
        RETURNING id INTO channel_id;
    END IF;

    RETURN channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to get user's conversations with last message preview
CREATE OR REPLACE FUNCTION get_user_conversations(user_id UUID)
RETURNS TABLE (
    channel_id UUID,
    other_user_id UUID,
    other_user_name TEXT,
    other_user_photo TEXT,
    last_message TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count BIGINT,
    is_online BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        CASE
            WHEN dc.user1_id = user_id THEN dc.user2_id
            ELSE dc.user1_id
        END,
        p.display_name,
        p.photo_url,
        dm.content,
        dm.created_at,
        COALESCE(unread.count, 0),
        p.last_seen > NOW() - INTERVAL '5 minutes'
    FROM direct_channels dc
    LEFT JOIN LATERAL (
        SELECT content, created_at, sender_id
        FROM direct_messages
        WHERE channel_id = dc.id
        ORDER BY created_at DESC
        LIMIT 1
    ) dm ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*)
        FROM direct_messages
        WHERE channel_id = dc.id
        AND sender_id != user_id
        AND is_read = false
    ) unread ON true
    JOIN profiles p ON p.id = CASE
        WHEN dc.user1_id = user_id THEN dc.user2_id
        ELSE dc.user1_id
    END
    WHERE dc.user1_id = user_id OR dc.user2_id = user_id
    ORDER BY COALESCE(dm.created_at, dc.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


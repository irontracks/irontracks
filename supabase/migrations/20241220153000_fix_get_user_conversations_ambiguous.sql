-- Fix ambiguous column reference in get_user_conversations by qualifying columns

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
        END AS other_user_id,
        p.display_name AS other_user_name,
        p.photo_url AS other_user_photo,
        dm_last.content AS last_message,
        dm_last.created_at AS last_message_at,
        COALESCE(unread.count, 0) AS unread_count,
        p.last_seen > NOW() - INTERVAL '5 minutes' AS is_online
    FROM direct_channels AS dc
    LEFT JOIN LATERAL (
        SELECT dm.content, dm.created_at, dm.sender_id
        FROM direct_messages AS dm
        WHERE dm.channel_id = dc.id
        ORDER BY dm.created_at DESC
        LIMIT 1
    ) AS dm_last ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS count
        FROM direct_messages AS dm2
        WHERE dm2.channel_id = dc.id
        AND dm2.sender_id != user_id
        AND dm2.is_read = false
    ) AS unread ON true
    JOIN profiles AS p ON p.id = CASE
        WHEN dc.user1_id = user_id THEN dc.user2_id
        ELSE dc.user1_id
    END
    WHERE dc.user1_id = user_id OR dc.user2_id = user_id
    ORDER BY COALESCE(dm_last.created_at, dc.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


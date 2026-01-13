-- Drop problematic policies
DROP POLICY IF EXISTS "Anyone can view global channel" ON chat_channels;
DROP POLICY IF EXISTS "Users can view private channels they are members of" ON chat_channels;
DROP POLICY IF EXISTS "Users can view members of their channels" ON chat_members;

-- CHAT CHANNELS POLICIES (no cyclic references)
CREATE POLICY "View global channels"
ON chat_channels FOR SELECT
USING (type = 'global');

CREATE POLICY "View my private channels"
ON chat_channels FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM chat_members m
    WHERE m.channel_id = chat_channels.id
      AND m.user_id = auth.uid()
  )
);

-- CHAT MEMBERS POLICIES (restrict to self only to avoid recursion)
CREATE POLICY "View my memberships"
ON chat_members FOR SELECT
USING (user_id = auth.uid());


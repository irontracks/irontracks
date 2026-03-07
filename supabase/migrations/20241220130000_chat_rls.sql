-- Enable RLS on Chat Tables
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- CHAT CHANNELS POLICIES
CREATE POLICY "Anyone can view global channel" 
ON chat_channels FOR SELECT 
USING (type = 'global');

CREATE POLICY "Users can view private channels they are members of" 
ON chat_channels FOR SELECT 
USING (
  id IN (SELECT channel_id FROM chat_members WHERE user_id = auth.uid())
);

CREATE POLICY "Authenticated users can create channels" 
ON chat_channels FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- CHAT MEMBERS POLICIES
CREATE POLICY "Users can view members of their channels" 
ON chat_members FOR SELECT 
USING (
  channel_id IN (SELECT id FROM chat_channels WHERE type = 'global') 
  OR 
  channel_id IN (SELECT channel_id FROM chat_members WHERE user_id = auth.uid())
);

CREATE POLICY "Authenticated users can insert members" 
ON chat_members FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- CHAT INVITES POLICIES
CREATE POLICY "Users can view invites they sent" 
ON chat_invites FOR SELECT 
USING (sender_id = auth.uid());

CREATE POLICY "Users can view invites sent to their email" 
ON chat_invites FOR SELECT 
USING (receiver_email = (select email from auth.users where id = auth.uid()));

CREATE POLICY "Users can insert invites" 
ON chat_invites FOR INSERT 
TO authenticated 
WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update invites sent to their email" 
ON chat_invites FOR UPDATE 
USING (receiver_email = (select email from auth.users where id = auth.uid()));

-- MESSAGES POLICIES
CREATE POLICY "Users can view messages in global or their private channels" 
ON messages FOR SELECT 
USING (
  channel_id IN (SELECT id FROM chat_channels WHERE type = 'global')
  OR
  channel_id IN (SELECT channel_id FROM chat_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert messages in global or their private channels" 
ON messages FOR INSERT 
WITH CHECK (
  channel_id IN (SELECT id FROM chat_channels WHERE type = 'global')
  OR
  channel_id IN (SELECT channel_id FROM chat_members WHERE user_id = auth.uid())
);

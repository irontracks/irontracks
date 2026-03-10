-- Team chat messages: lightweight table for team workout chat
-- No FK constraints — uses team_session_id directly as the grouping key
-- Messages are ephemeral by nature but persisted for reliable delivery

CREATE TABLE IF NOT EXISTS public.team_chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    display_name TEXT NOT NULL DEFAULT 'Parceiro',
    photo_url TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for efficient queries by session
CREATE INDEX IF NOT EXISTS idx_team_chat_messages_session
    ON public.team_chat_messages (session_id, created_at DESC);

-- Enable RLS but allow all authenticated users (team sessions are already access-controlled)
ALTER TABLE public.team_chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to read messages (needed for postgres_changes subscription)
CREATE POLICY "Anyone can read team chat" ON public.team_chat_messages
    FOR SELECT USING (true);

-- Allow any authenticated user to insert their own messages
CREATE POLICY "Users can insert own team chat" ON public.team_chat_messages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime for postgres_changes subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_chat_messages;

-- Auto-cleanup: delete messages older than 24 hours (team chats are short-lived)
-- Run this periodically via Supabase cron or pg_cron
-- SELECT cron.schedule('cleanup-team-chat', '0 */6 * * *', $$DELETE FROM public.team_chat_messages WHERE created_at < now() - interval '24 hours'$$);

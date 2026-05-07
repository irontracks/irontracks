-- whatsapp_conversations
-- Tracks AI-driven WhatsApp reactivation conversations.
-- Managed exclusively via service role (cron + webhook) — no direct client access.

CREATE TABLE public.whatsapp_conversations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone            TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'resolved', 'opted_out')),
  -- Gemini chat history: [{role:'user'|'model', text:'...'}]
  context          JSONB       NOT NULL DEFAULT '[]'::jsonb,
  last_user_message TEXT,
  last_bot_message  TEXT,
  last_message_at  TIMESTAMPTZ DEFAULT now(),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX whatsapp_conversations_user_id_idx  ON public.whatsapp_conversations(user_id);
CREATE INDEX whatsapp_conversations_phone_idx    ON public.whatsapp_conversations(phone);
CREATE INDEX whatsapp_conversations_status_idx   ON public.whatsapp_conversations(status);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- Only admins can read via authenticated client; writes happen via service role.
CREATE POLICY "Admins can manage whatsapp conversations"
  ON public.whatsapp_conversations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

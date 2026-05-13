-- Fix: team_chat_messages SELECT policy era `USING (true)` (audit Finding #6)
-- ─────────────────────────────────────────────────────────────────────────────
-- A policy original deixava qualquer usuário autenticado ler TODAS as mensagens
-- de TODOS os times via supabase-js (`select('*').from('team_chat_messages')`).
--
-- O comentário do migration original dizia "team sessions are already
-- access-controlled" — mas isso só vale para os endpoints API. O cliente
-- supabase-js conecta direto e ignora os endpoints. Resultado: leak completo
-- de chats privados de team workout (incluindo display_name, photo_url, content).
--
-- Agora a policy valida via EXISTS que o `auth.uid()` é:
--   (a) o teacher da team_session correspondente, OU
--   (b) um participante registrado em team_session_participants.
--
-- Notas:
-- - `session_id` em team_chat_messages é TEXT; team_sessions.id é UUID.
--   Cast `::text` em ambos os lados garante compatibilidade.
-- - Mantemos a policy INSERT atual (já restringe via `sender_id = auth.uid()`).
-- - postgres_changes (realtime) respeita RLS — clientes vão receber
--   apenas eventos de canais aos quais têm acesso.

DROP POLICY IF EXISTS "Anyone can read team chat" ON public.team_chat_messages;

CREATE POLICY "Members read team chat" ON public.team_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_sessions ts
      LEFT JOIN public.team_session_participants p
        ON p.session_id::text = ts.id::text
      WHERE ts.id::text = team_chat_messages.session_id
        AND (
          ts.teacher_id = (select auth.uid())
          OR p.user_id = (select auth.uid())
        )
    )
  );

-- Index pra ajudar o planner com o EXISTS — já existe idx_team_chat_messages_session.
-- Sem novos indexes necessários, mas se queries ficarem lentas em prod,
-- considerar materializar membership em uma view ou cache layer.

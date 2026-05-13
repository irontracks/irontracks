-- Fix: team_chat_messages SELECT policy era `USING (true)` (audit Finding #6)
-- ─────────────────────────────────────────────────────────────────────────────
-- A policy original deixava qualquer usuário autenticado ler TODAS as mensagens
-- de TODOS os times via supabase-js. Leak completo de chats privados.
--
-- Schema real do banco (verificado via information_schema):
--   team_sessions:       id (uuid), host_uid (uuid), participants (jsonb array
--                        de {uid, name, photo}), status, workout_state, ...
--   team_session_presence: session_id (uuid), user_id (uuid), status, updated_at
--   team_chat_messages:  session_id (TEXT — armazena o uuid da team_session)
--
-- A policy nova considera 3 caminhos de membership:
--   (a) host_uid = auth.uid()  → quem criou a sessão é host
--   (b) row em team_session_presence (presence tracking ao vivo)
--   (c) entrada em participants[] (snapshot persistente)
--
-- INSERT continua restrito a `auth.uid() = user_id` (já estava OK).

DROP POLICY IF EXISTS "Anyone can read team chat" ON public.team_chat_messages;

CREATE POLICY "Members read team chat" ON public.team_chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_sessions ts
      WHERE ts.id::text = team_chat_messages.session_id
        AND (
          ts.host_uid = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.team_session_presence p
            WHERE p.session_id = ts.id
              AND p.user_id = (select auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(coalesce(ts.participants, '[]'::jsonb)) AS e
            WHERE (e->>'uid')::uuid = (select auth.uid())
          )
        )
    )
  );

-- postgres_changes (realtime) respeita RLS — clientes recebem apenas eventos
-- de canais aos quais têm acesso. Índice idx_team_chat_messages_session já existe.

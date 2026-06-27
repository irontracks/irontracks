-- Endurece a RLS de INSERT de team_chat_messages: além de auth.uid() = user_id,
-- exige que o autor seja MEMBRO da sessão (host / presença / participants[]) —
-- espelha a policy de SELECT (migration 20260513111015). Fecha o write-IDOR via
-- supabase-js direto (a rota notify usa service-role e não é afetada).
-- Auditoria de segurança 2026-06-27 (#6b). Idempotente.

DROP POLICY IF EXISTS "Users can insert own team chat" ON public.team_chat_messages;
DROP POLICY IF EXISTS "Members insert team chat" ON public.team_chat_messages;

CREATE POLICY "Members insert team chat" ON public.team_chat_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.team_sessions ts
      WHERE ts.id::text = team_chat_messages.session_id
        AND (
          ts.host_uid = (select auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.team_session_presence p
            WHERE p.session_id = ts.id AND p.user_id = (select auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(coalesce(ts.participants, '[]'::jsonb)) AS e
            WHERE (e->>'uid')::uuid = (select auth.uid())
          )
        )
    )
  );

-- Fix: direct_messages/direct_channels tinham policies DUPLICADAS, sendo uma
-- delas frouxa (audit Finding #3 — DM spam universal).
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS no Postgres é PERMISSIVO por default: basta UMA policy passar pro acesso
-- ser autorizado. Tínhamos 2 policies INSERT em direct_messages e 2 SELECT em
-- direct_channels — uma "boa" (com can_dm_pair + membership) e uma "frouxa"
-- (só checa sender_id = auth.uid()). Atacante via supabase-js usava a frouxa
-- e enviava DM pra qualquer auth user sem precisar passar pelo RPC
-- `get_or_create_direct_channel` que tem as validações certas.
--
-- Schema state confirmado via pg_policies antes desta migration:
--   direct_messages: dm_insert_own (FROUXA), dm_select_own (duplicada),
--                    direct_messages_insert_participants (BOA, com can_dm_pair),
--                    direct_messages_select_participants (BOA),
--                    direct_messages_update_participants (BOA)
--   direct_channels: dc_select_own (duplicada), direct_channels_select_participants (BOA),
--                    direct_channels_insert_participants (BOA, com can_dm_pair)
--
-- Solução: remover as 3 policies duplicadas frouxas. As "BOAS" permanecem e
-- garantem que INSERT/SELECT só funciona pra membros + pares com `can_dm_pair`.
--
-- `can_dm_pair(user1, user2)`:
--   - caller deve ser user1 OU user2 (single-sided op)
--   - admin sempre passa
--   - ambos precisam ter `preferences.allowDirectMessages != false`
-- Pode ser endurecido futuramente pra exigir relação aceita (teacher-student),
-- mas isso muda comportamento de produto e fica pra PR dedicado de UX.

-- ── direct_messages ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS dm_insert_own ON public.direct_messages;
DROP POLICY IF EXISTS dm_select_own ON public.direct_messages;

-- ── direct_channels ─────────────────────────────────────────────────────────
-- dc_insert_own é a outra policy frouxa de INSERT — só checa auth.uid() em
-- user1/user2 sem can_dm_pair. Atacante criava canal direto via supabase-js
-- antes de mandar a primeira mensagem. Removida.
DROP POLICY IF EXISTS dc_insert_own ON public.direct_channels;
DROP POLICY IF EXISTS dc_select_own ON public.direct_channels;

-- ── Verificação post-condition (informativa, pra log) ───────────────────────
-- Após esta migration, restantes em pg_policies:
--   direct_messages: direct_messages_insert_participants, direct_messages_select_participants,
--                    direct_messages_update_participants
--   direct_channels: direct_channels_insert_participants, direct_channels_select_participants
--
-- Confira em prod com:
--   SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('direct_channels','direct_messages')
--    ORDER BY tablename, cmd;

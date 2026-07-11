-- F2: o canal de broadcast do treino em dupla (team_logs:<session_id>) era PÚBLICO —
-- qualquer cliente autenticado que soubesse/vazasse o UUID da sessão podia escutar os
-- logs ao vivo e INJETAR eventos (pause/resume/challenge/workout_edit/exercise_share).
-- Correção: Realtime Authorization. Estas políticas em realtime.messages autorizam
-- SELECT (receber) e INSERT (enviar) no tópico team_logs:<uuid> APENAS para membros da
-- sessão (host ou participante), via can_view_team_session (SECURITY DEFINER).
--
-- É NO-OP enquanto o canal continua público (canais públicos não consultam a RLS de
-- realtime.messages); passa a valer quando o cliente marca o canal como private:true.
-- Os outros canais de dupla (session:, team_chat_rt:, team_session_presence:) usam
-- postgres_changes e já são gateados pela RLS das tabelas — não precisam de policy aqui.

create policy "team_logs broadcast: members can receive"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^team_logs:[0-9a-fA-F-]{36}$'
  and public.can_view_team_session(
        split_part((select realtime.topic()), ':', 2)::uuid, (select auth.uid()))
);

create policy "team_logs broadcast: members can send"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and (select realtime.topic()) ~ '^team_logs:[0-9a-fA-F-]{36}$'
  and public.can_view_team_session(
        split_part((select realtime.topic()), ':', 2)::uuid, (select auth.uid()))
);

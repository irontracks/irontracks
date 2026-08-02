-- Fecha o EXECUTE das RPCs criadas em 02/08/2026 (ago/2026).
--
-- Postgres concede EXECUTE a PUBLIC por padrão em toda função nova, e no
-- Supabase isso alcança `anon` e `authenticated`. As duas funções que subiram
-- hoje nasceram assim — flagrado pelo advisor de segurança logo depois:
--
-- • `rollup_user_activity_monthly` é SECURITY DEFINER e varre a tabela de
--   telemetria inteira. Aberta a `anon`, qualquer visitante não autenticado
--   podia disparar a agregação em loop — DoS de CPU no banco de produção. Só
--   o cron (service_role) tem motivo para chamar.
--
-- • `patch_active_session_logs` é SECURITY INVOKER e já era inofensiva para
--   `anon` (sem `auth.uid()` ela retorna false na primeira linha), mas expor
--   ao papel anônimo uma função que só faz sentido logado é superfície à toa.
--   `authenticated` PRECISA continuar — é o app, no meio do treino, que chama.
--
-- Padrão aplicado: revoga de PUBLIC (que é de onde o acesso vem) e reconcede
-- só a quem precisa.

revoke all on function public.rollup_user_activity_monthly(date, date) from public;
revoke all on function public.rollup_user_activity_monthly(date, date) from anon;
revoke all on function public.rollup_user_activity_monthly(date, date) from authenticated;
grant execute on function public.rollup_user_activity_monthly(date, date) to service_role;

revoke all on function public.patch_active_session_logs(jsonb, text[], bigint, text) from public;
revoke all on function public.patch_active_session_logs(jsonb, text[], bigint, text) from anon;
grant execute on function public.patch_active_session_logs(jsonb, text[], bigint, text) to authenticated;
grant execute on function public.patch_active_session_logs(jsonb, text[], bigint, text) to service_role;

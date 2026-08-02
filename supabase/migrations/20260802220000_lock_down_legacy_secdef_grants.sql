-- Varredura das funções SECURITY DEFINER expostas a anon/authenticated
-- (ago/2026). Continuação do lockdown das RPCs novas (20260802200000).
--
-- ACHADO CONFIRMADO, não suspeita: rodando `set role anon` no banco de
-- produção, um visitante NÃO AUTENTICADO conseguiu ler a contagem real de
-- alunos de um professor (10) e o limite do plano dele. As funções abaixo não
-- têm guarda interna e aceitam um uuid arbitrário — é um oráculo de
-- enumeração para quem tiver (ou adivinhar) um user_id, que circula em perfis
-- públicos e na comunidade.
--
-- Classificação (cada linha foi decidida por evidência, não por nome):
--
-- GRUPO 1 — revogado de anon E authenticated. Todos os call-sites no código
-- usam `createAdminClient()` (service-role); nenhum precisa do papel do
-- usuário. `dedupe_direct_channels` não tem call-site nenhum.
--
-- GRUPO 2 — revogado só de anon. São chamadas pelo app logado (browser ou
-- server autenticado), então `authenticated` continua.
--
-- NÃO TOCADO, de propósito:
-- • `auth_uid` — usada em 185 policies, 20 delas avaliadas por `anon`
--   ({public}). Revogar derruba leitura de nutrição, notificações, exames,
--   check-ins e mais. É helper de RLS, não superfície de API.
-- • funções que retornam `trigger` — o PostgREST não expõe esse tipo, então o
--   EXECUTE sobrando não é explorável; mexer seria risco (signup depende de
--   `handle_new_user`) sem ganho.
-- • `get_dashboard_bootstrap`, `increment/decrement_vip_usage_daily`,
--   `join_team_session_by_code` — `anon` já não tinha acesso.

-- ── GRUPO 1: exclusivas do service-role ───────────────────────────────────
-- Vazamento confirmado: contagem de alunos por professor.
revoke all on function public.teacher_student_count(uuid) from public, anon, authenticated;
grant execute on function public.teacher_student_count(uuid) to service_role;

-- Vazamento confirmado: limite do plano do professor.
revoke all on function public.teacher_can_add_student(uuid) from public, anon, authenticated;
grant execute on function public.teacher_can_add_student(uuid) to service_role;

-- Sonda de grafo social: "estes dois usuários têm canal privado?".
revoke all on function public.users_share_private_channel(uuid, uuid) from public, anon, authenticated;
grant execute on function public.users_share_private_channel(uuid, uuid) to service_role;

-- Recuperação de senha. Já tinha guarda interna (`raise exception` se o papel
-- não for service_role), mas o EXECUTE aberto era a camada errada de defesa.
revoke all on function public.verify_recovery_code_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_recovery_code_admin(uuid, text) to service_role;

-- Manutenção de canais duplicados; sem nenhum call-site no app.
revoke all on function public.dedupe_direct_channels() from public, anon, authenticated;
grant execute on function public.dedupe_direct_channels() to service_role;

-- ── GRUPO 2: app logado usa; anon nunca deveria ───────────────────────────
revoke all on function public.iron_rank_leaderboard(integer) from public, anon;
grant execute on function public.iron_rank_leaderboard(integer) to authenticated, service_role;

revoke all on function public.iron_rank_my_total_volume() from public, anon;
grant execute on function public.iron_rank_my_total_volume() to authenticated, service_role;

revoke all on function public.get_or_create_direct_channel(uuid, uuid) from public, anon;
grant execute on function public.get_or_create_direct_channel(uuid, uuid) to authenticated, service_role;

revoke all on function public.get_user_conversations(uuid) from public, anon;
grant execute on function public.get_user_conversations(uuid) to authenticated, service_role;

revoke all on function public.admin_get_vip_stats(date, date) from public, anon;
grant execute on function public.admin_get_vip_stats(date, date) to authenticated, service_role;

-- Helpers de RLS sem nenhuma policy avaliada por anon (conferido em
-- pg_policies): fecham para anon, seguem para authenticated.
revoke all on function public.auth_role() from public, anon;
grant execute on function public.auth_role() to authenticated, service_role;

revoke all on function public.can_view_story(uuid, uuid) from public, anon;
grant execute on function public.can_view_story(uuid, uuid) to authenticated, service_role;

revoke all on function public.can_dm_pair(uuid, uuid) from public, anon;
grant execute on function public.can_dm_pair(uuid, uuid) to authenticated, service_role;

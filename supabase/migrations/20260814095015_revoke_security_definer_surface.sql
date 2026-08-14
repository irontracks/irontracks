-- SEC-04 (auditoria 2026-08-13): reduz a superfície SECURITY DEFINER exposta.
-- Classificação medida em 14/08/2026 (pg_trigger, pg_policies, grep de .rpc()
-- no código) — cada revoke abaixo tem o chamador conferido, não presumido.
-- Aplicada via MCP em 14/08/2026 (versão 20260814095015).

-- ── 1. Funções de TRIGGER (12) ────────────────────────────────────────────────
-- Disparam pelo sistema como parte do DML; o EXECUTE do chamador não participa
-- (Postgres checa EXECUTE do dono da tabela na criação do trigger). Nenhuma é
-- chamável utilmente via /rest/v1/rpc — o revoke fecha a porta e cala o advisor.
revoke all on function public.block_cancelled_teacher_login() from public, anon, authenticated;
revoke all on function public.check_favorite_limit() from public, anon, authenticated;
revoke all on function public.ees_guard_review_fields() from public, anon, authenticated;
revoke all on function public.enforce_invite_whitelist() from public, anon, authenticated;
revoke all on function public.enforce_invite_whitelist_v2() from public, anon, authenticated;
revoke all on function public.enforce_teacher_student_limit() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.link_student_and_profile() from public, anon, authenticated;
revoke all on function public.link_student_profile_from_whitelist() from public, anon, authenticated;
revoke all on function public.link_teacher_profile_from_whitelist() from public, anon, authenticated;
revoke all on function public.link_user_and_profile() from public, anon, authenticated;
revoke all on function public.link_user_and_profile_v2() from public, anon, authenticated;

-- ── 2. RPCs de cliente: revoga só ANON (o app chama com usuário autenticado) ──
-- authenticated FICA: get_dashboard_bootstrap/get_or_create_direct_channel/
-- get_user_conversations/increment+decrement_vip_usage_daily/iron_rank_* são
-- chamadas pelo client logado (grep em src). admin_get_vip_stats idem, com
-- guarda interna de papel (conferida no prosrc).
revoke all on function public.get_dashboard_bootstrap(p_user_id uuid) from public, anon;
revoke all on function public.get_or_create_direct_channel(user1 uuid, user2 uuid) from public, anon;
revoke all on function public.get_user_conversations(user_id uuid) from public, anon;
revoke all on function public.increment_vip_usage_daily(p_user_id uuid, p_feature_key text, p_day date) from public, anon;
revoke all on function public.decrement_vip_usage_daily(p_user_id uuid, p_feature_key text, p_day date) from public, anon;
revoke all on function public.iron_rank_leaderboard(limit_count integer) from public, anon;
revoke all on function public.iron_rank_my_total_volume() from public, anon;
revoke all on function public.admin_get_vip_stats(period_start date, period_end date) from public, anon;

-- ── 3. Feature morta: treino em dupla ─────────────────────────────────────────
-- Sem chamador no código e as tabelas team_* não existem (CLAUDE.md, 04/08/2026)
-- — a função só pode falhar; ninguém legítimo a chama.
revoke all on function public.join_team_session_by_code(code text) from public, anon, authenticated;

-- ── 4. Helpers de POLICY ficam intocados, de propósito ────────────────────────
-- auth_uid está em 207 policies (inclusive de anon: revogar derrubaria toda
-- query anônima nas tabelas que o citam); auth_role/can_dm_pair/can_view_story/
-- current_user_is_admin/current_user_teaches idem para authenticated.

-- ── 5. Decisões documentadas onde o advisor aponta ────────────────────────────
comment on view public.profiles_public is
  'Diretório social DELIBERADO (SECURITY DEFINER por desenho): expõe só 6 colunas '
  'públicas de profiles para authenticated (anon revogado em 2026-06-28). '
  'security_invoker quebraria comunidade/chat (lock_profiles_select_rls restringe a '
  'tabela); reabrir a RLS exporia e-mail. O ERROR do advisor 0010 é ACEITO com esta '
  'justificativa — ver auditoria 2026-08-13, SEC-04.';

comment on table public.phone_verifications is
  'RLS ligada SEM policy DE PROPÓSITO (default-deny): só o service-role escreve/lê '
  '(fluxo de OTP no servidor). O INFO 0008 do advisor é o comportamento desejado.';

-- Higiene de grants das RPCs restauradas (advisor 0028/0029 apontou logo após
-- a migration de restauração).
--
-- `REVOKE ... FROM anon` NÃO basta: ao criar uma função, o Postgres concede
-- EXECUTE a PUBLIC, e PUBLIC inclui anon. A migration original de hardening
-- (20260711092326) tinha o mesmo furo — o alerta continuava de pé, e só
-- apareceu agora porque o advisor 0028 é mais novo que ela.
--
-- As três RPCs já null-checam `auth.uid()` e levantam exceção, então anon nunca
-- conseguiu fazer nada útil; isto fecha a superfície exposta em /rest/v1/rpc,
-- que é o que o advisor cobra.
--
-- Aplicada via MCP em 2026-08-18. Conferido depois:
--   anon_pode = false, logado_pode = true nas três.
revoke execute on function public.accept_team_invite(uuid) from public;
revoke execute on function public.leave_team_session(uuid) from public;
revoke execute on function public.join_team_session_by_code(text) from public;

grant execute on function public.accept_team_invite(uuid) to authenticated;
grant execute on function public.leave_team_session(uuid) to authenticated;
grant execute on function public.join_team_session_by_code(text) to authenticated;

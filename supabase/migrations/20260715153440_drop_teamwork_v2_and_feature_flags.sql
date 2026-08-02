-- Limpeza: TeamworkV2 (aposentado em código, PR #428/#430) + sistema de
-- feature-flags (vestigial, PR #436). Tabelas órfãs, sem dependência externa,
-- só dados de teste. Confirmado pelo dono.
-- Aplicada via MCP em 2026-07-15.

-- 1) Tira as tabelas do TeamworkV2 da publication realtime.
do $$
begin
  execute 'alter publication supabase_realtime drop table invites, team_sessions, team_session_presence, team_chat_messages';
exception when others then null;
end $$;

-- 2) Dropa as tabelas (CASCADE: FK interna presence->sessions + policies das tabelas).
drop table if exists public.team_chat_messages cascade;
drop table if exists public.team_session_presence cascade;
drop table if exists public.team_sessions cascade;
drop table if exists public.invites cascade;

-- 3) Dropa as RPCs. CASCADE em can_view_team_session pra levar as policies de
--    broadcast em realtime.messages ("team_logs broadcast: ...") que dependiam dela.
drop function if exists public.accept_team_invite(uuid) cascade;
drop function if exists public.leave_team_session(uuid) cascade;
drop function if exists public.can_view_team_session(uuid, uuid) cascade;

-- 4) Dropa a tabela do sistema de feature-flags.
drop table if exists public.feature_flags cascade;

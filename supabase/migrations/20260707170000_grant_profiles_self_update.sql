-- Migration: restaura o UPDATE de perfil próprio (username, foto, nome, presença).
--
-- BUG (reportado): salvar o @username no menu de Configurações retornava
-- "database_error". Causa: a role `authenticated` só tinha SELECT em
-- public.profiles — faltava UPDATE. As policies profiles_update_own existem, mas
-- sem o GRANT de tabela o Postgres bloqueia ANTES da RLS (erro 42501). Isso
-- quebrava, silenciosamente, TUDO que o usuário edita no próprio perfil:
--   handle (username), photo_url (trocar foto), display_name (nome),
--   last_seen (ping de presença) e acquisition_source.
--
-- CORREÇÃO: GRANT UPDATE apenas nas colunas que o usuário legitimamente edita —
-- NÃO em role/approval_status/referral_code/email (evita escalada de privilégio,
-- já que a RLS só valida id = auth_uid(), não a coluna). A policy
-- profiles_update_own continua restringindo ao PRÓPRIO registro.

GRANT UPDATE (handle, display_name, photo_url, last_seen, acquisition_source)
  ON public.profiles TO authenticated;

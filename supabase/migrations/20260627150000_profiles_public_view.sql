-- View pública de profiles: expõe SÓ colunas não-sensíveis de TODAS as linhas a
-- usuários autenticados, substituindo o antigo profiles_read_all_authenticated
-- USING(true) (que vazava email/acquisition_source/referral_code/approval_status).
-- security_invoker=false (SECURITY DEFINER): roda como dono e ignora a RLS de
-- profiles DE PROPÓSITO — é o ponto único e auditável do que é público.
-- Auditoria de segurança 2026-06-27 (#7, fase 1). Aditiva e inerte: nada lê desta
-- view até o código ser repontado; a tabela profiles segue como está.
-- A migration de LOCK (drop do USING(true) + policies own/admin/teacher) é
-- separada e só entra após o código validado em produção (fase 2).

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = false) AS
SELECT
  id,
  display_name,
  handle,
  photo_url,
  last_seen,
  role
FROM public.profiles;

REVOKE ALL ON public.profiles_public FROM PUBLIC;
GRANT SELECT ON public.profiles_public TO authenticated;

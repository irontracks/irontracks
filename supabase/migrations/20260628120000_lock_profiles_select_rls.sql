-- #7 Fase 2: fecha o vazamento da policy profiles_read_all_authenticated USING(true)
-- (qualquer usuário autenticado lia email/marketing de TODA a base). Auditoria 2026-06-27.
-- Aplicada em produção via MCP após validação por dry-run transacional (usuário/admin/
-- professor) contra dados reais. Pré-requisito (já deployado): view public.profiles_public.
--
-- Cuidado crítico: a policy profiles_admin_all (cmd=ALL, is_admin()) só não recursava por
-- causa do curto-circuito do USING(true). Ao remover o USING(true), is_admin() (SECURITY
-- INVOKER, lê profiles) recursa infinitamente. Correção: helpers SECURITY DEFINER (que
-- bypassam RLS neste projeto, comprovado) em TODAS as policies de profiles que checam
-- admin/teacher.
--
-- Rollback:
--   DROP POLICY profiles_select_own ON public.profiles;
--   DROP POLICY profiles_select_admin ON public.profiles;
--   DROP POLICY profiles_select_teacher_students ON public.profiles;
--   ALTER POLICY profiles_admin_all ON public.profiles USING (is_admin()) WITH CHECK (is_admin());
--   CREATE POLICY profiles_read_all_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.current_user_is_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
  AS $f$ SELECT COALESCE((SELECT p.role = 'admin' FROM public.profiles p WHERE p.id = (SELECT auth.uid())), false) $f$;

CREATE OR REPLACE FUNCTION public.current_user_teaches(student_uid uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
  AS $f$ SELECT EXISTS(SELECT 1 FROM public.students s WHERE s.user_id = student_uid AND s.teacher_id = (SELECT auth.uid())) $f$;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_teaches(uuid) TO authenticated;

ALTER POLICY profiles_admin_all ON public.profiles
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS profiles_read_all_authenticated ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));

CREATE POLICY profiles_select_admin ON public.profiles
  FOR SELECT TO authenticated USING (public.current_user_is_admin());

CREATE POLICY profiles_select_teacher_students ON public.profiles
  FOR SELECT TO authenticated USING (public.current_user_teaches(id));

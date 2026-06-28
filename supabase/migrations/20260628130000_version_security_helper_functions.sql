-- Drift repo↔banco: estas funções de segurança existem em produção mas NÃO
-- estavam versionadas em nenhuma migration (foram criadas direto no DB). Várias
-- policies RLS (em students, workouts, active_workout_sessions, etc.) dependem
-- delas — sem este arquivo, recriar o schema pelas migrations deixaria essas
-- policies quebradas (função inexistente). Auditoria 2026-06-27 (item de drift).
--
-- CREATE OR REPLACE com a definição EXATA do estado vivo → idempotente/no-op em
-- produção; serve só pra repo ser fonte da verdade.

-- Retorna se o usuário atual é admin (lê profiles.role do próprio auth.uid()).
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO ''
  AS $function$
    SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false);
  $function$;

-- Retorna se o usuário atual é professor do aluno informado (vínculo em students).
CREATE OR REPLACE FUNCTION public.is_teacher_of(target_user_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SET search_path TO ''
  AS $function$
    SELECT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.user_id = target_user_id AND s.teacher_id = auth.uid()
    );
  $function$;

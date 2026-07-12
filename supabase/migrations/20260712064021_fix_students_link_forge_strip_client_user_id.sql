-- SECURITY (auditoria área professor) — CRÍTICO. A tabela students ficou de fora do lockdown
-- de 2026-07-11. Um caller authenticated QUALQUER (nem precisa role teacher) podia inserir
-- students{user_id: vítima, teacher_id: self} (a policy students_insert_silo só exige
-- teacher_id = auth.uid(), sem restringir user_id; o trigger devolvia NEW intacto quando o
-- email era vazio/falso). Isso vincula o atacante à vítima e destrava, via RLS direto, a
-- leitura de workouts/exercises/sets/active_workout_sessions/checkins/execution-videos da
-- vítima (confirmado empiricamente: 114 treinos), e dados de saúde (labs/fotos/avaliações)
-- pelas rotas de IA que gateiam por canCoachStudent.
--
-- Fix cirúrgico: para caller autenticado NÃO-admin, o user_id NÃO pode vir do cliente — ele
-- só pode ser setado pela resolução por email (dono REAL do email) ou por service-role/admin.
-- auth.uid() nulo = service-role (bypass legítimo: layout.tsx, rotas admin, approve de
-- access-request); admin preservado; "professor adiciona aluno por email" segue funcionando
-- (manda email, não user_id -> resolve pelo dono do email). Verificado: forge bloqueado
-- (forge_ok 1->0, workouts_vis 114->0), fluxo legítimo intacto (resolve o dono do email).
CREATE OR REPLACE FUNCTION public.link_student_profile_from_whitelist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid;
  v_email text;
BEGIN
  -- Anti-forja: caller autenticado não-admin não fixa user_id (só email-resolution/service-role/admin).
  IF auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  THEN
    NEW.user_id := NULL;
  END IF;

  v_email := lower(trim(COALESCE(NEW.email, '')));
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  SELECT u.id
    INTO v_uid
  FROM auth.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.user_id = v_uid) THEN
    IF NEW.user_id IS NULL OR NEW.user_id = v_uid THEN
      NEW.user_id := v_uid;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, display_name, last_seen, role)
  VALUES (v_uid, NEW.email, COALESCE(NEW.name, NEW.email), now(), 'student')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        last_seen = now(),
        role = CASE
          WHEN public.profiles.role = 'admin' THEN public.profiles.role
          WHEN public.profiles.role = 'teacher' THEN public.profiles.role
          ELSE 'student'
        END;

  RETURN NEW;
END;
$function$;

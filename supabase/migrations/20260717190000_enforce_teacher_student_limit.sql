-- Enforça o limite de alunos por plano do professor NO BANCO (trigger), porque o
-- caminho "Professor → + Aluno" fazia INSERT direto em `students` via cliente
-- (useAdminActions.ts) sem passar por nenhuma checagem — um professor free
-- (max_students=2) podia empilhar alunos sem teto. A rota assign-teacher já checava
-- via teacher_can_add_student, mas o INSERT direto furava.
--
-- Trigger é a defesa certa: cobre QUALQUER caminho de escrita (presente e futuro) e
-- não é burlável mexendo no cliente. Usa a RPC existente teacher_can_add_student,
-- que já lê a fonte de verdade correta (teachers.plan_tier_key → teacher_tiers.max_students).
--
-- Override: admin e service_role passam (decisão do dono — o admin pode adicionar
-- por cortesia/suporte; o assign-teacher via service-role já valida na API).

CREATE OR REPLACE FUNCTION public.enforce_teacher_student_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  -- Sem professor no vínculo (ex.: aluno criado por approve_access_request) → nada a limitar.
  IF NEW.teacher_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- UPDATE que não muda o professor não conta como novo vínculo.
  IF TG_OP = 'UPDATE' AND NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id THEN
    RETURN NEW;
  END IF;

  -- Override: service_role (backend/admin API) e admin. O professor comum NÃO isenta.
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- teacher_can_add_student conta os alunos ATUAIS: com o teto já batido, o próximo
  -- vínculo é barrado. A mensagem é lida pela UI pra mostrar o convite de upgrade.
  IF NOT public.teacher_can_add_student(NEW.teacher_id) THEN
    RAISE EXCEPTION 'teacher_student_limit_reached'
      USING ERRCODE = 'check_violation',
            HINT = 'Limite de alunos do plano atingido. Faça upgrade para adicionar mais.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_teacher_student_limit ON public.students;
CREATE TRIGGER trg_enforce_teacher_student_limit
  BEFORE INSERT OR UPDATE OF teacher_id ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_teacher_student_limit();

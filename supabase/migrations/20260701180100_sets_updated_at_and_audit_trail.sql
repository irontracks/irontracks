-- Bug "séries mudou sozinho" (2026-07-01) — instrumentação forense.
-- Antes NÃO havia updated_at nem qualquer trilha de auditoria em workouts/exercises/sets,
-- o que tornou impossível atribuir a alteração. Adiciona:
--   1) updated_at + touch trigger em exercises e sets.
--   2) tabela sets_audit (op, ids, actor=auth.uid(), role do JWT, old/new, at) alimentada
--      por trigger AFTER SECURITY DEFINER (grava sempre, contornando RLS na escrita).
--      Leitura só admin. Assim, qualquer mudança futura em séries é rastreável.
-- Rollback: drop dos triggers/tabela/colunas.

-- 1) updated_at ----------------------------------------------------------------
ALTER TABLE public.sets      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_sets ON public.sets;
CREATE TRIGGER trg_touch_sets BEFORE UPDATE ON public.sets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_exercises ON public.exercises;
CREATE TRIGGER trg_touch_exercises BEFORE UPDATE ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) trilha de auditoria de séries ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.sets_audit (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  op          text NOT NULL,
  set_id      uuid,
  exercise_id uuid,
  workout_id  uuid,
  old_row     jsonb,
  new_row     jsonb,
  actor       uuid,
  jwt_role    text,
  db_role     text,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sets_audit_workout_at  ON public.sets_audit (workout_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_sets_audit_exercise_at ON public.sets_audit (exercise_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_sets_audit_at          ON public.sets_audit (at DESC);

ALTER TABLE public.sets_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sets_audit_admin_select ON public.sets_audit;
CREATE POLICY sets_audit_admin_select ON public.sets_audit
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.audit_sets_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_exercise_id uuid;
  v_workout_id  uuid;
  v_jwt_role    text;
BEGIN
  v_exercise_id := COALESCE(NEW.exercise_id, OLD.exercise_id);
  SELECT e.workout_id INTO v_workout_id FROM public.exercises e WHERE e.id = v_exercise_id;
  BEGIN
    v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN others THEN
    v_jwt_role := NULL;
  END;
  INSERT INTO public.sets_audit (op, set_id, exercise_id, workout_id, old_row, new_row, actor, jwt_role, db_role)
  VALUES (
    TG_OP,
    COALESCE(NEW.id, OLD.id),
    v_exercise_id,
    v_workout_id,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END,
    auth.uid(),
    v_jwt_role,
    session_user
  );
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_sets_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_audit_sets ON public.sets;
CREATE TRIGGER trg_audit_sets AFTER INSERT OR UPDATE OR DELETE ON public.sets
  FOR EACH ROW EXECUTE FUNCTION public.audit_sets_change();

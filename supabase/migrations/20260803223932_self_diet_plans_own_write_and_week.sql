-- O usuário passa a salvar a PRÓPRIA dieta gerada, além de receber a do professor.
-- Até aqui `student_diet_plans` só aceitava escrita por service-role (fluxo
-- professor→aluno) e a dieta gerada no self-service era efêmera: gerava, mostrava
-- e sumia. A tabela está com 0 linhas em produção, então nada precisa migrar.

-- `plan_kind` distingue plano de UM dia do plano da SEMANA.
-- `days` guarda a semana inteira ([{weekday, meals[], totals}]); em plano de dia
-- fica NULL e as refeições continuam em `meals`, do jeito que o professor já grava.
-- A leitura normaliza os dois formatos num só (helper planDays), pra não existir
-- caminho duplicado no código.
ALTER TABLE public.student_diet_plans
  ADD COLUMN IF NOT EXISTS plan_kind text NOT NULL DEFAULT 'day',
  ADD COLUMN IF NOT EXISTS days jsonb;

ALTER TABLE public.student_diet_plans
  DROP CONSTRAINT IF EXISTS student_diet_plans_plan_kind_check;
ALTER TABLE public.student_diet_plans
  ADD CONSTRAINT student_diet_plans_plan_kind_check CHECK (plan_kind IN ('day','week'));

-- Escrita do plano PRÓPRIO. O par user_id = created_by = auth.uid() é o que impede
-- forjar um plano que pareça prescrito pelo professor (created_by é o que a UI usa
-- para marcar a origem e travar edição do que veio do coach).
DROP POLICY IF EXISTS student_diet_plans_own_write ON public.student_diet_plans;
CREATE POLICY student_diet_plans_own_write ON public.student_diet_plans
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND created_by = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND created_by = (SELECT auth.uid()));

COMMENT ON COLUMN public.student_diet_plans.plan_kind IS 'day | week — week usa a coluna days';
COMMENT ON COLUMN public.student_diet_plans.days IS 'Plano semanal: [{weekday, meals[], totals}]. NULL em plano de dia (usa meals).';

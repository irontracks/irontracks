-- Plano alimentar prescrito pelo PROFESSOR pro aluno. Antes, a dieta gerada por IA
-- (ai/diet-generate) era efêmera (só retornada, nunca persistida). Esta tabela guarda o
-- plano que o professor prescreve, pra o aluno ver depois.
-- Padrão da periodização: user_id = dono (aluno), created_by = autor (professor). A escrita
-- é feita via service-role após o gate canCoachStudent no código; o aluno lê só o seu.
CREATE TABLE public.student_diet_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,        -- o ALUNO (dono do plano)
  created_by uuid NOT NULL,     -- o PROFESSOR (autor)
  plan_name text NOT NULL DEFAULT 'Plano alimentar',
  meals jsonb NOT NULL DEFAULT '[]'::jsonb,   -- refeições + macros
  notes text,
  status text NOT NULL DEFAULT 'active',      -- active | archived
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_diet_plans ENABLE ROW LEVEL SECURITY;

-- Aluno lê só o SEU plano.
CREATE POLICY student_diet_plans_select_own ON public.student_diet_plans
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Admin faz tudo.
CREATE POLICY student_diet_plans_admin_all ON public.student_diet_plans
  FOR ALL USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

-- NENHUMA policy de INSERT/UPDATE pro authenticated: o professor grava via service-role,
-- gateado por canCoachStudent no código (mesmo modelo das tabelas de VIP/periodização).

-- Índice pro aluno buscar o plano ativo dele rápido.
CREATE INDEX idx_student_diet_plans_user_status ON public.student_diet_plans (user_id, status, created_at DESC);

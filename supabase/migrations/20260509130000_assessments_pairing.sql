-- Pareamento de avaliações: BIA standalone ↔ Avaliação por dobras
--
-- Caso de uso real
-- ────────────────
-- O aluno faz bioimpedância numa máquina externa (farmácia, clínica) e
-- chega com o PDF do resultado. A avaliação por dobras cutâneas é feita
-- noutro momento, com o personal trainer. São dois eventos separados que
-- refletem a mesma "fase" do aluno e queremos cruzá-los para mostrar a
-- média entre os dois métodos.
--
-- Modelo
-- ──────
--   assessment_type:
--     'full' — avaliação completa do personal (atual; default).
--     'bia'  — registro standalone só de BIA (vindo do PDF da farmácia).
--   paired_assessment_id:
--     Quando o app encontra um match (datas próximas, mesmo aluno), grava
--     o id da contraparte aqui em AMBOS os registros. Persistir o link
--     evita recálculo a cada listagem e permite o usuário "des-parear"
--     no futuro caso queira (não exposto nessa versão).
--
-- Compatibilidade
-- ───────────────
-- Todas as avaliações antigas viram `assessment_type='full'` automatica-
-- mente (default da coluna). Nada quebra. paired_assessment_id é nullable.

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS assessment_type text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS paired_assessment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assessments_type_chk'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_type_chk
      CHECK (assessment_type IN ('full', 'bia'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assessments_paired_fk'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_paired_fk
      FOREIGN KEY (paired_assessment_id)
      REFERENCES public.assessments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Índice para o algoritmo de matching: "achar full/bia do mesmo aluno em
-- janela de ±14 dias sem par ainda". O índice composto cobre os 4
-- predicados mais comuns (student_id, type, paired null, data).
CREATE INDEX IF NOT EXISTS assessments_pairing_lookup_idx
  ON public.assessments (student_id, assessment_type, paired_assessment_id, assessment_date);

COMMENT ON COLUMN public.assessments.assessment_type IS
  '''full'' = avaliação completa (dobras + medidas + opcionalmente BIA). ''bia'' = registro standalone só de bioimpedância (do PDF da máquina externa).';
COMMENT ON COLUMN public.assessments.paired_assessment_id IS
  'Auto-preenchido quando o app encontra uma contraparte (full↔bia) do mesmo aluno em datas próximas (janela ±14 dias). Bidirecional: ambos os registros apontam um para o outro.';

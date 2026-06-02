-- ════════════════════════════════════════════════════════════════════════════
-- Exames Laboratoriais + Protocolo Integrado por IA
-- ════════════════════════════════════════════════════════════════════════════
-- Usuário (ou personal mediado) sobe PDF/foto de exames de sangue. O Gemini Flash
-- extrai os marcadores; o Gemini Pro cruza com avaliação física + 90 dias de treino
-- e gera um protocolo (treino, dieta, suplementação). Feature VIP (pro+).
--
-- Acesso:
--   - dono:               auth.uid() = user_id
--   - personal (mediado): auth.uid() = trainer_id   (vínculo verificado no servidor)
--
-- Arquivos ficam em bucket PRIVADO (lab-exams) — exame médico é dado sensível,
-- NUNCA exposto publicamente. Leitura só via signed URL mintada no servidor.
-- Espelha o modelo de body_photo_assessments.

BEGIN;

-- ── Tabela principal: sessão de exame + análise ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_exams (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  trainer_id      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_by      uuid NOT NULL,
  exam_date       date,
  lab_name        text,

  -- Ciclo de vida: pending → uploading → extracting → analyzing → done | failed
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','uploading','extracting','analyzing','done','failed')),

  -- Marcadores extraídos pela IA (JSON validado por Zod no app antes de gravar).
  extracted_markers jsonb,
  -- Protocolo integrado gerado pela IA (treino+dieta+suplementação).
  protocol          jsonb,

  ai_model        text,
  ai_analyzed_at  timestamptz,
  error_message   text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lab_exams
  IS 'Exames laboratoriais + protocolo IA. user_id = mesmo auth id de workouts/assessments (cruzamento de dados).';
COMMENT ON COLUMN public.lab_exams.trainer_id
  IS 'Personal que criou (fluxo mediado). NULL em autoavaliação.';
COMMENT ON COLUMN public.lab_exams.extracted_markers
  IS 'Marcadores extraídos do PDF/foto (Gemini Flash), schema src/schemas/labExam.ts.';
COMMENT ON COLUMN public.lab_exams.protocol
  IS 'Protocolo integrado (Gemini Pro): treino, dieta, suplementação com doses. Informativo, não prescrição.';

-- ── Tabela de arquivos (1 exame pode ter vários PDFs/fotos) ─────────────────
CREATE TABLE IF NOT EXISTS public.lab_exam_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id       uuid NOT NULL REFERENCES public.lab_exams (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,              -- denormalizado p/ RLS de storage por prefixo
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  file_size     integer,
  mime_type     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lab_exam_files
  IS 'Arquivos individuais de um exame (bucket privado lab-exams).';

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lab_exams_user
  ON public.lab_exams (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_exams_trainer
  ON public.lab_exams (trainer_id) WHERE trainer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_exam_files_exam
  ON public.lab_exam_files (exam_id);

-- ── updated_at automático ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lab_exams_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lab_exams_updated_at ON public.lab_exams;
CREATE TRIGGER trg_lab_exams_updated_at
  BEFORE UPDATE ON public.lab_exams
  FOR EACH ROW EXECUTE FUNCTION public.lab_exams_touch_updated_at();

-- ── RLS: lab_exams ──────────────────────────────────────────────────────────
ALTER TABLE public.lab_exams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_exams_owner ON public.lab_exams;
CREATE POLICY lab_exams_owner
  ON public.lab_exams
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS lab_exams_trainer ON public.lab_exams;
CREATE POLICY lab_exams_trainer
  ON public.lab_exams
  FOR ALL
  USING (auth.uid() = trainer_id)
  WITH CHECK (auth.uid() = trainer_id);

-- ── RLS: lab_exam_files ─────────────────────────────────────────────────────
ALTER TABLE public.lab_exam_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_exam_files_owner ON public.lab_exam_files;
CREATE POLICY lab_exam_files_owner
  ON public.lab_exam_files
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.lab_exams e
     WHERE e.id = lab_exam_files.exam_id
       AND e.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lab_exams e
     WHERE e.id = lab_exam_files.exam_id
       AND e.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS lab_exam_files_trainer ON public.lab_exam_files;
CREATE POLICY lab_exam_files_trainer
  ON public.lab_exam_files
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.lab_exams e
     WHERE e.id = lab_exam_files.exam_id
       AND e.trainer_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.lab_exams e
     WHERE e.id = lab_exam_files.exam_id
       AND e.trainer_id = auth.uid()
  ));

-- ── Bucket privado lab-exams + storage policies (owner por prefixo) ─────────
-- Path: {user_id}/exams/{exam_id}/{timestamp}_{safeName}
INSERT INTO storage.buckets (id, name, public)
VALUES ('lab-exams', 'lab-exams', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS lab_exams_storage_owner_select ON storage.objects;
CREATE POLICY lab_exams_storage_owner_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lab-exams' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS lab_exams_storage_owner_insert ON storage.objects;
CREATE POLICY lab_exams_storage_owner_insert
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lab-exams' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS lab_exams_storage_owner_update ON storage.objects;
CREATE POLICY lab_exams_storage_owner_update
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'lab-exams' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS lab_exams_storage_owner_delete ON storage.objects;
CREATE POLICY lab_exams_storage_owner_delete
  ON storage.objects FOR DELETE
  USING (bucket_id = 'lab-exams' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

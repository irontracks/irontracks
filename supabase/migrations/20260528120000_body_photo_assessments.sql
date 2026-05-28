-- Migration: Body Photo Assessment (avaliação física por foto com IA)
--
-- Feature nova: usuário (ou personal) tira 3 fotos padronizadas (frente, perfil,
-- costas) e o Gemini Vision gera um laudo estruturado de composição corporal,
-- correlacionado com o histórico de treino do mesmo user_id.
--
-- Tabelas dedicadas (NÃO mexe na tabela `assessments` de produção que tem dados
-- reais e 7 policies). Espelha o modelo de acesso dual da `assessments`:
--   - dono (self-service):  auth.uid() = user_id
--   - personal (mediado):   auth.uid() = trainer_id
--
-- Fotos ficam em bucket PRIVADO (body-photos). Diferente do bucket público
-- bioimpedance-files — foto de corpo é sensível, nunca exposta publicamente.
-- Acesso às imagens só via signed URL mintada no servidor após checagem.

BEGIN;

-- ── Tabela principal: laudo da avaliação por foto ───────────────────────────
CREATE TABLE IF NOT EXISTS public.body_photo_assessments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  trainer_id      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_by      uuid NOT NULL,
  assessment_date date NOT NULL DEFAULT current_date,

  -- Ciclo de vida da análise IA
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'uploading', 'analyzing', 'done', 'failed')),

  -- Scores 0–100 (preenchidos pela IA; nullable até a análise rodar)
  composition_score numeric CHECK (composition_score BETWEEN 0 AND 100),
  symmetry_score    numeric CHECK (symmetry_score    BETWEEN 0 AND 100),
  posture_score     numeric CHECK (posture_score     BETWEEN 0 AND 100),
  proportion_score  numeric CHECK (proportion_score  BETWEEN 0 AND 100),

  -- % gordura como FAIXA (não número falso de precisão). Ex: 14–17%.
  body_fat_estimate_low  numeric CHECK (body_fat_estimate_low  BETWEEN 0 AND 100),
  body_fat_estimate_high numeric CHECK (body_fat_estimate_high BETWEEN 0 AND 100),

  -- Laudo completo estruturado (JSON validado por Zod no app antes de gravar)
  analysis        jsonb,
  ai_model        text,
  ai_analyzed_at  timestamptz,

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.body_photo_assessments
  IS 'Avaliação física por foto + laudo IA (Gemini Vision). user_id = mesmo auth id de workouts (correlação treino×corpo).';
COMMENT ON COLUMN public.body_photo_assessments.trainer_id
  IS 'Personal que criou a avaliação (fluxo mediado). NULL em autoavaliação.';
COMMENT ON COLUMN public.body_photo_assessments.analysis
  IS 'Laudo estruturado da IA: pontos fortes/fracos por grupo, postura, simetria, recomendações.';

-- ── Tabela de fotos (1 por pose) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.body_photo_assessment_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.body_photo_assessments (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,  -- denormalizado p/ RLS e prefixo do storage path
  pose          text NOT NULL CHECK (pose IN ('front', 'side', 'back')),
  storage_path  text NOT NULL,  -- {user_id}/{assessment_id}/{pose}.jpg no bucket body-photos
  width         integer,
  height        integer,
  file_size     integer,
  mime_type     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, pose)
);

COMMENT ON TABLE public.body_photo_assessment_photos
  IS 'Fotos da avaliação (frente/perfil/costas). storage_path aponta pro bucket PRIVADO body-photos.';

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_body_photo_assessments_user
  ON public.body_photo_assessments (user_id, assessment_date DESC);
CREATE INDEX IF NOT EXISTS idx_body_photo_assessments_trainer
  ON public.body_photo_assessments (trainer_id)
  WHERE trainer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_body_photo_assessment_photos_assessment
  ON public.body_photo_assessment_photos (assessment_id);

-- ── updated_at trigger (padrão do projeto: função por tabela) ────────────────
CREATE OR REPLACE FUNCTION public.body_photo_assessments_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS body_photo_assessments_touch ON public.body_photo_assessments;
CREATE TRIGGER body_photo_assessments_touch
  BEFORE UPDATE ON public.body_photo_assessments
  FOR EACH ROW EXECUTE FUNCTION public.body_photo_assessments_touch_updated_at();

-- ── RLS: avaliações ─────────────────────────────────────────────────────────
ALTER TABLE public.body_photo_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS body_photo_assessments_owner ON public.body_photo_assessments;
CREATE POLICY body_photo_assessments_owner
  ON public.body_photo_assessments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS body_photo_assessments_trainer ON public.body_photo_assessments;
CREATE POLICY body_photo_assessments_trainer
  ON public.body_photo_assessments
  FOR ALL
  USING (auth.uid() = trainer_id)
  WITH CHECK (auth.uid() = trainer_id);

-- ── RLS: fotos ──────────────────────────────────────────────────────────────
ALTER TABLE public.body_photo_assessment_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS body_photo_photos_owner ON public.body_photo_assessment_photos;
CREATE POLICY body_photo_photos_owner
  ON public.body_photo_assessment_photos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS body_photo_photos_trainer ON public.body_photo_assessment_photos;
CREATE POLICY body_photo_photos_trainer
  ON public.body_photo_assessment_photos
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.body_photo_assessments a
     WHERE a.id = body_photo_assessment_photos.assessment_id
       AND a.trainer_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.body_photo_assessments a
     WHERE a.id = body_photo_assessment_photos.assessment_id
       AND a.trainer_id = auth.uid()
  ));

-- ── Storage: bucket PRIVADO body-photos ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('body-photos', 'body-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Owner gerencia objetos sob o próprio prefixo {user_id}/...
-- (Personal acessa via signed URL mintada no servidor — admin client.)
DROP POLICY IF EXISTS body_photos_owner_select ON storage.objects;
CREATE POLICY body_photos_owner_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'body-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS body_photos_owner_insert ON storage.objects;
CREATE POLICY body_photos_owner_insert
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'body-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS body_photos_owner_update ON storage.objects;
CREATE POLICY body_photos_owner_update
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'body-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS body_photos_owner_delete ON storage.objects;
CREATE POLICY body_photos_owner_delete
  ON storage.objects FOR DELETE
  USING (bucket_id = 'body-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

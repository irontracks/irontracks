-- ════════════════════════════════════════════════════════════════════════════
-- Importar treino por FOTO/PDF
-- ════════════════════════════════════════════════════════════════════════════
-- O usuário fotografa a ficha de treino (papel do personal, impressão, print de
-- outro app) ou sobe um PDF; o Gemini Flash lê e devolve os treinos/exercícios
-- estruturados. O usuário revisa e só então os treinos são criados.
--
-- Espelha o modelo de lab_exams (sessão + arquivos + status), pelos mesmos
-- motivos: a extração pode passar de 30 s, o upload é multi-arquivo por signed
-- URL (precisa de um id pra agrupar antes de extrair) e "tentar de novo" não
-- pode exigir reupload.
--
-- Diferenças deliberadas em relação a lab_exams:
--   • sem trainer_id — nesta v1 só o dono importa a própria ficha; o personal
--     já monta treino pelo editor, não precisa passar por foto;
--   • os ARQUIVOS SÃO DESCARTÁVEIS. Ver o comentário do bucket lá embaixo.
--
-- Bucket PRIVADO (workout-imports): a ficha costuma ter nome do aluno, telefone
-- do personal na margem, às vezes dado de outra pessoa. Nunca vai pro Cloudinary
-- (que é a mídia pública do app: avatar, stories).

BEGIN;

-- ── Sessão de importação ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_photo_imports (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  -- Ciclo de vida: pending → uploading → extracting → extracted | failed
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','uploading','extracting','extracted','failed')),

  -- { workouts: [{ title, exercises: [...] }] } — validado por Zod no app antes
  -- de gravar (src/schemas/workoutPhotoImport.ts).
  extracted_workouts jsonb,

  ai_model           text,
  ai_extracted_at    timestamptz,
  error_message      text,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workout_photo_imports
  IS 'Sessão de import de treino por foto/PDF. Os arquivos são apagados após a extração; o JSON extraído fica para revisão e retry.';
COMMENT ON COLUMN public.workout_photo_imports.extracted_workouts
  IS 'Treinos lidos da ficha (Gemini Flash), schema src/schemas/workoutPhotoImport.ts. Rascunho: só vira treino de verdade depois que o usuário confirma.';

-- ── Arquivos da importação (uma ficha pode ter várias páginas) ──────────────
CREATE TABLE IF NOT EXISTS public.workout_photo_import_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id     uuid NOT NULL REFERENCES public.workout_photo_imports (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,              -- denormalizado p/ RLS de storage por prefixo
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  file_size     integer,
  mime_type     text,
  -- Marcado quando o arquivo é apagado do bucket após a extração. A linha fica
  -- (auditoria/debug de "quantas páginas tinha a ficha"), o arquivo não.
  purged_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workout_photo_import_files
  IS 'Páginas/arquivos de um import (bucket privado workout-imports). purged_at marca que o arquivo já saiu do storage.';

-- ── Índices ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workout_photo_imports_user
  ON public.workout_photo_imports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_photo_import_files_import
  ON public.workout_photo_import_files (import_id);

-- ── updated_at automático ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workout_photo_imports_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Postgres concede EXECUTE a PUBLIC em toda função nova, e no Supabase PUBLIC
-- inclui `anon`. Função de trigger não precisa ser chamável por ninguém de fora.
REVOKE ALL ON FUNCTION public.workout_photo_imports_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workout_photo_imports_touch_updated_at() FROM anon;

DROP TRIGGER IF EXISTS trg_workout_photo_imports_updated_at ON public.workout_photo_imports;
CREATE TRIGGER trg_workout_photo_imports_updated_at
  BEFORE UPDATE ON public.workout_photo_imports
  FOR EACH ROW EXECUTE FUNCTION public.workout_photo_imports_touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.workout_photo_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workout_photo_imports_owner ON public.workout_photo_imports;
CREATE POLICY workout_photo_imports_owner
  ON public.workout_photo_imports
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.workout_photo_import_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workout_photo_import_files_owner ON public.workout_photo_import_files;
CREATE POLICY workout_photo_import_files_owner
  ON public.workout_photo_import_files
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.workout_photo_imports i
     WHERE i.id = workout_photo_import_files.import_id
       AND i.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.workout_photo_imports i
     WHERE i.id = workout_photo_import_files.import_id
       AND i.user_id = auth.uid()
  ));

-- ── Bucket privado workout-imports + storage policies (owner por prefixo) ───
-- Path: {user_id}/imports/{import_id}/{timestamp}_{safeName}
--
-- Diferente de lab-exams e body-photos, o arquivo aqui NÃO é um registro que o
-- usuário quer guardar: é insumo descartável de uma conversão. Depois que os
-- treinos são extraídos, a foto não tem mais uso — e é justamente o pedaço
-- sensível (nome, telefone do personal, ficha de outra pessoa na mesma página).
-- A rota de extração apaga o objeto e carimba purged_at.
INSERT INTO storage.buckets (id, name, public)
VALUES ('workout-imports', 'workout-imports', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS workout_imports_storage_owner_select ON storage.objects;
CREATE POLICY workout_imports_storage_owner_select
  ON storage.objects FOR SELECT
  USING (bucket_id = 'workout-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS workout_imports_storage_owner_insert ON storage.objects;
CREATE POLICY workout_imports_storage_owner_insert
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'workout-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS workout_imports_storage_owner_update ON storage.objects;
CREATE POLICY workout_imports_storage_owner_update
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'workout-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS workout_imports_storage_owner_delete ON storage.objects;
CREATE POLICY workout_imports_storage_owner_delete
  ON storage.objects FOR DELETE
  USING (bucket_id = 'workout-imports' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

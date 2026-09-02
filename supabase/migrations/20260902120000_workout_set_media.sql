-- Foto/vídeo anexado à OBSERVAÇÃO de uma série (02/09/2026, pedido do dono).
--
-- Casos: fotografar a máquina para a IA confirmar se é a certa; filmar a
-- execução e perguntar "está correta?". A análise roda ao FINALIZAR o treino
-- (rota de finish → waitUntil) e o resultado vai para o histórico, para o PDF e
-- para o painel do professor. Cota VIP própria (`media_analysis`).
--
-- A referência da mídia viaja DENTRO do log da série (`logs["ex-set"].media`),
-- que já é o que vai para `workouts.notes` — assim o relatório encontra a mídia
-- sem join. Esta tabela guarda o que o log não pode: o caminho no storage, a
-- resposta da IA e a visibilidade para o professor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.workout_set_media (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Preenchido na finalização (o treino ainda não existe quando a mídia sobe).
  workout_id      uuid REFERENCES public.workouts (id) ON DELETE SET NULL,
  exercise_index  integer NOT NULL,
  set_index       integer NOT NULL,
  exercise_name   text,
  kind            text NOT NULL CHECK (kind IN ('photo', 'video')),
  bucket_id       text NOT NULL DEFAULT 'set-media',
  object_path     text NOT NULL,
  mime_type       text,
  file_size       integer,
  -- A observação da série no momento da análise — é a pergunta do aluno.
  question        text,
  ai_status       text NOT NULL DEFAULT 'pending'
                    CHECK (ai_status IN ('pending', 'analyzing', 'analyzed', 'failed', 'skipped')),
  ai_answer       text,
  ai_model        text,
  ai_error        text,
  analyzed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workout_set_media
  IS 'Foto/vídeo anexado à observação de uma série do treino ativo. A IA analisa na finalização; o aluno vê no histórico/PDF e o professor no painel.';

CREATE INDEX IF NOT EXISTS idx_workout_set_media_user
  ON public.workout_set_media (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_set_media_workout
  ON public.workout_set_media (workout_id) WHERE workout_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.workout_set_media_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.workout_set_media_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workout_set_media_touch_updated_at() FROM anon;
DROP TRIGGER IF EXISTS trg_workout_set_media_updated_at ON public.workout_set_media;
CREATE TRIGGER trg_workout_set_media_updated_at
  BEFORE UPDATE ON public.workout_set_media
  FOR EACH ROW EXECUTE FUNCTION public.workout_set_media_touch_updated_at();

ALTER TABLE public.workout_set_media ENABLE ROW LEVEL SECURITY;

-- Lê: o dono, o professor do dono, o admin. Escreve: só o dono (insert/delete
-- via rotas com service-role, mas a policy existe para o cliente também poder
-- listar/apagar o seu). UPDATE fica sem policy: a resposta da IA é gravada
-- pelo servidor (service-role) — o cliente não reescreve laudo.
DROP POLICY IF EXISTS workout_set_media_select ON public.workout_set_media;
CREATE POLICY workout_set_media_select ON public.workout_set_media
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_teacher_of(user_id) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS workout_set_media_insert_own ON public.workout_set_media;
CREATE POLICY workout_set_media_insert_own ON public.workout_set_media
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS workout_set_media_delete_own ON public.workout_set_media;
CREATE POLICY workout_set_media_delete_own ON public.workout_set_media
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Bucket privado. 60 MB: vídeo de execução de 30–40 s no iPhone (HEVC) fica
-- abaixo disso; acima é caso de comprimir no aparelho, não de abrir a porta.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('set-media', 'set-media', false, 62914560)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

-- Mesmo desenho do execution-videos: pasta = userId; o professor do dono lê.
DROP POLICY IF EXISTS set_media_insert_own ON storage.objects;
CREATE POLICY set_media_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'set-media' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS set_media_select_own_teacher_admin ON storage.objects;
CREATE POLICY set_media_select_own_teacher_admin ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'set-media' AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.teacher_id = auth.uid() AND (s.user_id)::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS set_media_update_own ON storage.objects;
CREATE POLICY set_media_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'set-media' AND (storage.foldername(name))[1] = (auth.uid())::text);

DROP POLICY IF EXISTS set_media_delete_own ON storage.objects;
CREATE POLICY set_media_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'set-media' AND (storage.foldername(name))[1] = (auth.uid())::text);

COMMIT;

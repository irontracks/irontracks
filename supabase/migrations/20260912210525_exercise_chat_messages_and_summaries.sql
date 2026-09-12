-- Chat de IA POR EXERCÍCIO no treino ativo (12/09/2026, pedido do dono).
--
-- Cada exercício do treino ativo ganha uma conversa com a IA (texto + foto/
-- vídeo). Ao sair do chat o aluno decide se aquilo entra no relatório; se sim,
-- a IA escreve um RESUMO daquele exercício (`exercise_chat_summaries`).
--
-- ⚠️ A conversa é DO ALUNO e o professor NÃO pode lê-la — requisito explícito
-- do dono. Por isso estas duas tabelas são as ÚNICAS do treino sem policy de
-- professor/admin: só `auth.uid() = user_id`, nos quatro verbos. Quem for
-- acrescentar leitura de coach aqui está desfazendo a feature, não ampliando.
--
-- A chave da sessão é `session_started_at`: `active_workout_sessions` tem PK
-- em `user_id` (não existe coluna `id`), e a linha é APAGADA no finish — logo
-- não há FK possível nem desejável; o carimbo é o que sobrevive ao fim do
-- treino e liga a conversa ao resumo.

BEGIN;

CREATE TABLE IF NOT EXISTS public.exercise_chat_messages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- Carimbo da sessão de treino (active_workout_sessions.started_at).
  session_started_at timestamptz NOT NULL,
  exercise_index     integer NOT NULL,
  exercise_name      text NOT NULL,
  role               text NOT NULL CHECK (role IN ('user', 'assistant')),
  content            text NOT NULL,
  -- Mídia anexada à mensagem (caminho no storage; bucket resolvido por quem lê).
  media_path         text,
  media_kind         text CHECK (media_kind IN ('photo', 'video')),
  media_mime         text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.exercise_chat_messages
  IS 'Conversa do ALUNO com a IA sobre um exercício do treino ativo. Privada: nem professor nem admin leem (RLS só do dono).';

CREATE TABLE IF NOT EXISTS public.exercise_chat_summaries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  session_started_at timestamptz NOT NULL,
  exercise_index     integer NOT NULL,
  exercise_name      text NOT NULL,
  summary            text NOT NULL,
  -- Preenchido na finalização (o treino ainda não existe durante a sessão).
  workout_id         uuid REFERENCES public.workouts (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_chat_summaries_unico_por_exercicio
    UNIQUE (user_id, session_started_at, exercise_index)
);

COMMENT ON TABLE public.exercise_chat_summaries
  IS 'Resumo que a IA escreve quando o aluno decide levar o chat daquele exercício para o relatório. Privado: só o dono lê.';

-- Leitura quente: a thread de UM exercício da sessão em curso, em ordem.
CREATE INDEX IF NOT EXISTS idx_exercise_chat_messages_thread
  ON public.exercise_chat_messages (user_id, session_started_at, exercise_index, created_at);

CREATE INDEX IF NOT EXISTS idx_exercise_chat_summaries_sessao
  ON public.exercise_chat_summaries (user_id, session_started_at, exercise_index);

CREATE INDEX IF NOT EXISTS idx_exercise_chat_summaries_workout
  ON public.exercise_chat_summaries (workout_id) WHERE workout_id IS NOT NULL;

-- ── RLS: SOMENTE O DONO, nos quatro verbos ────────────────────────────────
ALTER TABLE public.exercise_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_chat_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exercise_chat_messages_select_own ON public.exercise_chat_messages;
CREATE POLICY exercise_chat_messages_select_own ON public.exercise_chat_messages
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS exercise_chat_messages_insert_own ON public.exercise_chat_messages;
CREATE POLICY exercise_chat_messages_insert_own ON public.exercise_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS exercise_chat_messages_update_own ON public.exercise_chat_messages;
CREATE POLICY exercise_chat_messages_update_own ON public.exercise_chat_messages
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS exercise_chat_messages_delete_own ON public.exercise_chat_messages;
CREATE POLICY exercise_chat_messages_delete_own ON public.exercise_chat_messages
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS exercise_chat_summaries_select_own ON public.exercise_chat_summaries;
CREATE POLICY exercise_chat_summaries_select_own ON public.exercise_chat_summaries
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS exercise_chat_summaries_insert_own ON public.exercise_chat_summaries;
CREATE POLICY exercise_chat_summaries_insert_own ON public.exercise_chat_summaries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS exercise_chat_summaries_update_own ON public.exercise_chat_summaries;
CREATE POLICY exercise_chat_summaries_update_own ON public.exercise_chat_summaries
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS exercise_chat_summaries_delete_own ON public.exercise_chat_summaries;
CREATE POLICY exercise_chat_summaries_delete_own ON public.exercise_chat_summaries
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMIT;

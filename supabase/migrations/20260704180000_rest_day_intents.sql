-- Migration: registra a resposta diária "vai treinar hoje?" (modo dia de descanso)
--
-- CONTEXTO: de manhã o app pergunta se o usuário vai treinar. Se responder que
-- vai descansar, a meta de calorias do dia é reduzida na nutrição (desconta ~1
-- treino). Esta tabela guarda a resposta por usuário por dia (calendário BRT).
--
-- ESCOPO: uma linha por (user_id, date_key). RLS: cada usuário só lê/escreve as
-- próprias linhas. Nada de acesso cruzado.

CREATE TABLE IF NOT EXISTS public.rest_day_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  date_key date NOT NULL,
  will_train boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date_key)
);

-- Leitura rápida por usuário + dia (o caso de uso único da tabela).
CREATE INDEX IF NOT EXISTS rest_day_intents_user_date_idx
  ON public.rest_day_intents (user_id, date_key);

ALTER TABLE public.rest_day_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own rest day intents" ON public.rest_day_intents;
CREATE POLICY "Users read own rest day intents"
ON public.rest_day_intents FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users insert own rest day intents" ON public.rest_day_intents;
CREATE POLICY "Users insert own rest day intents"
ON public.rest_day_intents FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users update own rest day intents" ON public.rest_day_intents;
CREATE POLICY "Users update own rest day intents"
ON public.rest_day_intents FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users delete own rest day intents" ON public.rest_day_intents;
CREATE POLICY "Users delete own rest day intents"
ON public.rest_day_intents FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

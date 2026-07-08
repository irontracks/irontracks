-- Idempotência da finalização de treino: coluna + índice único parcial.
--
-- Estes objetos JÁ EXISTEM em produção (foram aplicados fora do git). Este
-- arquivo versiona o schema para que ambientes novos (local, Supabase preview
-- branches, restore/rebuild) tenham a MESMA proteção anti-duplicata que a rota
-- POST /api/workouts/finish depende. Sem a coluna, a rota cai num fallback que
-- insere SEM a chave → idempotência desligada → duplo clique/retry cria duas
-- sessões no histórico.
--
-- É idempotente (IF NOT EXISTS) — reaplicar em produção é no-op.

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS finish_idempotency_key text;

-- Índice único parcial: só sessões (não templates) com chave não-vazia.
-- Bate exatamente com o índice já existente em produção.
CREATE UNIQUE INDEX IF NOT EXISTS workouts_user_finish_idempotency_key_uniq
  ON public.workouts USING btree (user_id, finish_idempotency_key)
  WHERE ((is_template = false) AND (finish_idempotency_key IS NOT NULL) AND (finish_idempotency_key <> ''::text));

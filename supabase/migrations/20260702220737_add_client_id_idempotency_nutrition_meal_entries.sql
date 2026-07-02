-- Idempotência da fila offline de nutrição: reenvio do MESMO lançamento (resposta
-- HTTP perdida após o commit, comum em rede móvel instável) não duplica mais a
-- refeição nem infla os totais do dia. client_id = uuid otimista da UI.
-- Índice único PARCIAL (só quando client_id não é nulo) pra não afetar linhas
-- antigas nem lançamentos sem clientId (que podem coexistir como hoje).
-- Espelha o padrão já usado em workouts_finish_idempotency_key.
ALTER TABLE public.nutrition_meal_entries
  ADD COLUMN IF NOT EXISTS client_id text;

CREATE UNIQUE INDEX IF NOT EXISTS nutrition_meal_entries_user_client_uniq
  ON public.nutrition_meal_entries (user_id, client_id)
  WHERE client_id IS NOT NULL;

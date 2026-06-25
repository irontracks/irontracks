-- Fix: public.try_parse_numeric truncava decimais (47,5 / 47.5 -> 47).
--
-- Causa: o regex estava numa string SQL padrão (não E''), então `\\.`
-- virava DOIS backslashes literais no padrão (`\\` + `.`), e a parte decimal
-- `(?:\\.[0-9]+)?` exigia um backslash literal na entrada — nunca casava.
-- Sobrava só a parte inteira, descartando a fração.
--
-- Correção: usar string E'' com escape correto (`\\.` -> um backslash ->
-- regex `\.` -> ponto decimal literal). Único caractere alterado é o regex;
-- todo o resto da função (trim, vírgula->ponto, search_path, EXCEPTION) é
-- idêntico à definição anterior em produção.
--
-- Impacto (medido read-only antes de aplicar): pesos/reps com fração passam a
-- contar a fração. Aumenta retroativamente "kg levantados" e o volume do
-- leaderboard (iron_rank_*) — alinha o backend ao frontend (setVolume.ts já
-- parseia decimais). Também afeta save_workout_atomic e o RPC de exercícios,
-- que gravam sets.weight via esta função (somente inserts futuros).

CREATE OR REPLACE FUNCTION public.try_parse_numeric(p_text text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  cleaned text;
  m text[];
BEGIN
  cleaned := btrim(COALESCE(p_text, ''));
  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  cleaned := replace(cleaned, ',', '.');
  m := regexp_match(cleaned, E'(-?[0-9]+(?:\\.[0-9]+)?)');
  IF m IS NULL OR array_length(m, 1) < 1 THEN
    RETURN NULL;
  END IF;

  RETURN m[1]::numeric;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$function$;

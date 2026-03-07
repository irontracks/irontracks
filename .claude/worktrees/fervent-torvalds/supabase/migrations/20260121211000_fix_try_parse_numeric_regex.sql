CREATE OR REPLACE FUNCTION public.try_parse_numeric(p_text text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
  cleaned text;
  m text[];
BEGIN
  cleaned := btrim(COALESCE(p_text, ''));
  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  cleaned := replace(cleaned, ',', '.');
  m := regexp_match(cleaned, '(-?[0-9]+(?:\\.[0-9]+)?)');
  IF m IS NULL OR array_length(m, 1) < 1 THEN
    RETURN NULL;
  END IF;

  RETURN m[1]::numeric;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$fn$;

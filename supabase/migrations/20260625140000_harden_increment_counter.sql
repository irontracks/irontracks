-- Endurece increment_counter (SECURITY DEFINER) — achado #11 da auditoria.
--
-- Problemas:
--   1. (BUG REAL) A migration 20260401 setou search_path='' (correto p/ segurança),
--      mas a função usa %I sem schema → 'UPDATE exercise_canonical' não resolve em
--      runtime. O único caller tem fallback (read-then-write), então o INCREMENTO
--      ATÔMICO está quebrado desde então e a race condition que a função deveria
--      prevenir voltou silenciosamente. Corrige qualificando public.%I.
--   2. (DEFESA EM PROFUNDIDADE) Recebia (table_name, column_name) dinâmicos sem
--      whitelist. EXECUTE hoje já é só service_role + postgres (não público), mas
--      mesmo esses só devem incrementar o contador pretendido → whitelist estrita.
--
-- Não quebra o caller — ele usa exatamente (exercise_canonical, usage_count) via
-- service_role; e o increment atômico volta a funcionar.

create or replace function public.increment_counter(
  table_name text,
  column_name text,
  row_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Whitelist estrita: só o contador real. Qualquer outro par é rejeitado.
  if not (table_name = 'exercise_canonical' and column_name = 'usage_count') then
    raise exception 'increment_counter: par (%, %) nao permitido', table_name, column_name
      using errcode = 'check_violation';
  end if;

  execute format(
    'UPDATE public.%I SET %I = coalesce(%I, 0) + 1 WHERE id = $1',
    table_name, column_name, column_name
  ) using row_id;
end;
$$;

-- Remove EXECUTE do público; concede só ao service_role (admin client).
revoke all on function public.increment_counter(text, text, uuid) from public, anon, authenticated;
grant execute on function public.increment_counter(text, text, uuid) to service_role;

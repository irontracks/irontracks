-- Endurece e CONSERTA increment_counter (SECURITY DEFINER).
-- Reaplicação do arquivo 20260625140000_harden_increment_counter.sql, que
-- NUNCA rodou: a versão 20260625140000 colidia com fix_try_parse_numeric_decimal
-- (já aplicada) e o arquivo ficou órfão fora do controle de versão até 14/08/2026.
-- Aplicada via MCP em 14/08/2026 (versão 20260814095031).
--
-- 1. (BUG VIVO) A migration 20260401 setou search_path='' (correto), mas o corpo
--    usa %I sem schema → 'UPDATE exercise_canonical' não resolve em runtime e o
--    incremento atômico FALHA desde então; o único caller (service-role,
--    exercise-aliases) sobrevive por um fallback read-then-write com corrida.
--    Corrige qualificando public.%I.
-- 2. (DEFESA) Whitelist estrita do par (tabela, coluna): mesmo o service_role só
--    incrementa o contador pretendido.
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

-- Grants já estavam corretos em produção; reafirma para o caso de recriação.
revoke all on function public.increment_counter(text, text, uuid) from public, anon, authenticated;
grant execute on function public.increment_counter(text, text, uuid) to service_role;

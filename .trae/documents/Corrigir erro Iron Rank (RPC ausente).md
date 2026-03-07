## Diagnóstico do novo erro
- Agora que a RPC existe, o erro mudou para **“invalid input syntax for type numeric: \"9-12\"”** (ou similar).
- Isso acontece porque em alguns treinos antigos o `logs.reps`/`logs.weight` vem como faixa (ex.: `"9-12"`) e a RPC tenta fazer cast direto para `numeric`.

## Correção
### 1) Ajustar parsing numérico na RPC (à prova de faixas)
- Criar uma nova migration que:
  - Adiciona uma helper `public.try_parse_numeric(text)` que extrai **o primeiro número válido** (ex.: `"9-12"` → `9`, `"12,5"` → `12.5`) e retorna `NULL` quando não dá.
  - Atualiza `public.iron_rank_leaderboard(limit_count int)` para usar `public.try_parse_numeric(e.value->>'weight') * public.try_parse_numeric(e.value->>'reps')`.
- Arquivo novo: `supabase/migrations/20260121xxxxxx_fix_iron_rank_leaderboard_numeric_parse.sql`.

### 2) Mensagem de erro no modal
- Se ainda ocorrer algum erro de dados, o modal passa a mostrar uma mensagem curta (“Dados de treino antigos com formato inválido; ranking em manutenção”) além do detalhe técnico opcional.

## Validação
- Reaplicar/rodar a migration no Supabase.
- Testar no SQL Editor:
  - `select * from public.iron_rank_leaderboard(10);`
- Testar na UI: clicar no card **IRON RANK** e confirmar que o modal lista o ranking.

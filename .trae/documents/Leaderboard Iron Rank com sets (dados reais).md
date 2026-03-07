## Situação atual
- A RPC já existe e não está mais quebrando.
- O modal ficou vazio (“Ainda não há dados…”) porque a RPC atual soma volume usando `workouts.notes->logs`, mas o volume real do app hoje está em `public.sets` (join `exercises → workouts`).

## O que vou fazer agora (inclui rodar SQL via CLI como você pediu)
### 1) Criar uma migration nova (RPC baseada em `sets`)
- Adicionar uma migration que faz `CREATE OR REPLACE FUNCTION public.iron_rank_leaderboard(limit_count int)` calculando:
  - `SUM(sets.weight * try_parse_numeric(sets.reps))`
  - somente `sets.completed = true`
  - somente `workouts.is_template = false`
- Para não duplicar volume, manter fallback por `notes->logs` apenas para workouts que **não têm** linhas em `sets`.

### 2) Aplicar no Supabase via CLI (no projeto enbueukmvgodngydkpzm)
- Executar `npx supabase db push` na raiz do projeto para aplicar as migrations no seu Supabase.
- Se a CLI pedir autenticação, eu rodo `npx supabase login` (vai abrir fluxo/URL) e continuo.

### 3) Verificação rápida
- Fazer uma checagem via SQL (pela própria RPC) para confirmar que retorna top usuários.
- Testar na UI clicando no card IRON RANK e validar que a lista aparece.

## Observação sobre os logs
- O `net::ERR_ABORTED /api/version` é do script de versão do layout e pode aparecer no preview.
- O ranking depende da RPC retornar dados — com a troca para `sets`, ele deve aparecer.
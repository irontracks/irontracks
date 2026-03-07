## Diagnóstico
- A mensagem do modal **“Ainda não há dados suficientes para o ranking.”** agora não é erro de RPC: significa que o cálculo retornou **0 usuários com volume > 0**.
- O motivo mais provável no seu banco: muitos registros em `public.sets` têm `completed = NULL` (ou não é marcado), então a RPC que filtra `completed = true` acaba ignorando quase tudo.

## O que vou fazer
### 1) Ajustar a RPC para considerar séries com completed = NULL
- Criar uma nova migration que faz `CREATE OR REPLACE FUNCTION public.iron_rank_leaderboard(...)` com regra:
  - contar série quando `(completed = true OR completed IS NULL)`
  - e `weight > 0` e `reps` parseável > 0
- Mantém fallback legado (`notes->logs`) apenas quando não existir sets no treino.

### 2) Aplicar via CLI (automático)
- Rodar novamente `npx supabase db push` para aplicar a migration no Supabase.

### 3) Validação
- Testar a RPC no banco retornando Top 10.
- Reabrir o modal na dashboard e confirmar que aparece o ranking.

## O que está acontecendo
- Agora o modal não mostra erro de SQL: a chamada da RPC está retornando **lista vazia**.
- Isso pode acontecer por 3 causas principais:
  1) não existe volume calculável (peso/reps) nos dados salvos
  2) os logs/séries existem, mas estão em um formato/caminho diferente do que a RPC está lendo
  3) o volume existe, mas está sendo descartado por join/filtros (ex.: profiles faltando, filtros muito restritos)

## O que vou fazer
### 1) Criar um endpoint de diagnóstico (server-side)
- Adicionar `GET /api/diagnostics/iron-rank` que retorna JSON com:
  - resultado bruto de `rpc('iron_rank_leaderboard', { limit_count: 10 })`
  - contagem de `workouts` não-template
  - contagem de workouts que têm `notes->logs` parseável e com entradas `done=true`
  - contagem de `sets` com `(completed=true OR completed IS NULL)`, `weight>0` e `reps` parseável
  - amostra (1) do formato real de `notes` (apenas chaves/estrutura, sem dados sensíveis)

### 2) Validar o diagnóstico localmente
- Abrir `/api/diagnostics/iron-rank` no dev server e identificar em qual fonte o volume está (sets vs notes->logs) e por que está zerando.

### 3) Aplicar correção definitiva
- Dependendo do que o diagnóstico apontar:
  - **Se o problema for join com profiles**: ajustar a RPC para `LEFT JOIN profiles` e usar `l.uid` como `user_id`.
  - **Se o problema for caminho/estrutura do JSON**: ajustar a RPC para ler o caminho correto (ex.: `notes.session.logs` vs `notes.logs`).
  - **Se o problema for que o app não está persistindo sets/logs do jeito esperado**: ajustar o fluxo de finalização do treino para gravar `sets` (ou normalizar `notes`) para o ranking sempre ter volume.

### 4) Verificar na UI
- Reabrir o modal do Iron Rank e confirmar que o ranking aparece.

Se você confirmar, eu implemento o endpoint de diagnóstico e faço a correção certa baseada no que ele retornar.
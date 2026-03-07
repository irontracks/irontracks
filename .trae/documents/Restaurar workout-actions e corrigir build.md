## Diagnóstico
- O build quebra porque o arquivo importado em vários lugares **não existe mais**:
  - `./src/actions/workout-actions.js` → “No such file or directory (os error 2)”
- Conferi a pasta `src/actions/` e realmente não há `workout-actions.js` nem `workout-actions.ts`.
- Vários componentes/client importam esse módulo (dashboard, report, history, admin), então o Next não compila sem ele.

## Plano de correção
### 1) Recriar `src/actions/workout-actions.js`
- Criar novamente o arquivo com as exports exigidas pelos imports atuais:
  - `createWorkout`, `updateWorkout`, `deleteWorkout`, `importData`, `computeWorkoutStreakAndStats`
  - `getLatestWorkoutPrs`, `getIronRankLeaderboard`
  - `generatePostWorkoutInsights`, `generatePeriodReportInsights`, `generateAssessmentPlanAi`, `applyProgressionToNextTemplate`
- Implementação real para as funções críticas (CRUD + ranking + PRs):
  - Usar `createClient()` do Supabase browser client.
  - `createWorkout/updateWorkout`: chamar a RPC `save_workout_atomic` para salvar workout + exercises + sets.
  - `deleteWorkout`: deletar em `workouts` (RLS controla) e retornar `{ success: true/false }`.
  - `computeWorkoutStreakAndStats`: calcular streak/volume e badges de forma resiliente.
  - `getLatestWorkoutPrs`: buscar último treino (não-template), parsear logs e devolver `{ ok, prs, workout }`.
  - `getIronRankLeaderboard`: chamar `rpc('iron_rank_leaderboard')` e devolver `{ ok, data }`.
- Para as funções de IA (insights/progressão/plano):
  - Implementar versão “safe”: retorna `{ ok:false, error:'Em manutenção' }` sem quebrar a UI, já que não há rota/API clara no projeto para isso hoje.

### 2) Ajustar compatibilidade de retorno
- Garantir que cada função retorna no formato que os componentes esperam:
  - `deleteWorkout` → `{ success: boolean, error?: string }`
  - `getLatestWorkoutPrs` → `{ ok: boolean, prs: [], workout?: { date, title } }`
  - `generatePostWorkoutInsights` → `{ ok: boolean, ai?: any, saved?: boolean, error?: string }`
  - etc.

### 3) Validar
- Rodar `npm run lint`.
- Rodar/dev e confirmar que a tela volta a compilar e abrir o modal do Iron Rank.

Quando você confirmar, eu implemento isso e valido a compilação.
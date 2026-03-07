## Diagnóstico do que está acontecendo
- O dashboard busca templates em `workouts` com join aninhado `exercises(sets(*))` e depois **remove** qualquer treino que venha com `exercises` vazio.
- Isso faz aparecer “Nenhum treino criado” mesmo se existir treino no banco, caso o join aninhado falhe (RLS/relacionamento PostgREST/legado) ou caso os treinos estejam sem exercícios.

Arquivos principais:
- Fetch: [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L1117-L1270)
- Filtro que zera tudo: `mappedRaw.filter(w => w.exercises.length > 0)`
- Tela vazia: [StudentDashboard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StudentDashboard.tsx)

## Correção (sem depender de join aninhado)
### 1) Fazer um fetch “robusto” em 3 passos
- Buscar templates em `workouts` (sem nested select)
- Buscar `exercises` por `workout_id in (...)`
- Buscar `sets` por `exercise_id in (...)`
- Montar a árvore no JS e alimentar `mapWorkoutRow` com `exercises` já preenchido

Isso evita “sumir tudo” se o nested select estiver vindo vazio por algum motivo.

### 2) Remover o filtro que descarta treinos sem exercícios
- Em vez de esconder, exibir o treino mesmo vazio.
- Se estiver vazio, mostrar no card um estado “Treino sem exercícios” (para você enxergar o problema e poder corrigir/editar).

### 3) Compatibilidade com legado (se necessário)
- Se o usuário não encontrar nenhum treino por `user_id = auth.uid()`, tentar também:
  - resolver `students.id` por `students.user_id = auth.uid()`
  - buscar templates por `workouts.user_id = students.id` e/ou `workouts.student_id = students.id`.

## Validação
- Logar em conta antiga e confirmar que a lista aparece.
- Se vier treino vazio, confirmar que agora ele aparece (não some), com aviso.
- Rodar lint/build.

Se aprovado, eu implemento essa correção direto no `fetchWorkouts` e ajusto a UI para não esconder treinos.”}
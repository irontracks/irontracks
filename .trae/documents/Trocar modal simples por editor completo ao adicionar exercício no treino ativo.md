## Objetivo
- No treino ativo, o botão **Adicionar exercício** deve abrir o **mesmo modal completo** (ExerciseEditor) usado na dashboard, com todas as opções (método, vídeos, notes, cardio/força, bi-set, etc.).

## Situação atual
- Em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js), o botão “Exercício” abre um modal simples (`addExerciseOpen`) com só nome/sets/descanso.
- O app já tem o editor completo para o treino ativo via `onEditWorkout` (abre o ExerciseEditor em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js)).

## Mudanças
### 1) Reaproveitar o editor completo ao clicar em “Adicionar Exercício”
- Remover o modal simples de `addExerciseOpen` do [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js).
- Trocar o onClick do botão “Exercício” para abrir o editor completo.

### 2) Manter o comportamento de “adicionar” (já abrir com um exercício novo)
- Introduzir um novo callback `onAddExercise` no ActiveWorkout.
- Em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js):
  - Estender `handleOpenActiveWorkoutEditor` para aceitar uma opção `{ addExercise: true }`.
  - Quando `addExercise` for true, abrir o ExerciseEditor já com **um exercício em branco** adicionado no final (usando o mesmo template que o ExerciseEditor cria ao clicar “Adicionar Exercício”).

### 3) Garantir compatibilidade com logs e treino em andamento
- Usar a lógica já existente de `reindexSessionLogsAfterWorkoutEdit` ao salvar no editor, para preservar logs do que já foi feito.

## Validação
- Abrir treino ativo → clicar “Exercício” → abre o editor completo.
- Exercício novo já aparece no final da lista.
- Salvar → volta pro treino ativo com o exercício novo.
- `npm run build` passa.

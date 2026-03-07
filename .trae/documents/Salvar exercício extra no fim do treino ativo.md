## Objetivo
Quando o usuário adicionar exercício extra durante o treino ativo, ao finalizar o treino perguntar se deseja salvar essa alteração no treino (template). Se clicar em “Sim”, atualizar o treino para incluir o(s) exercício(s) adicionado(s).

## Diagnóstico (estado atual)
- O botão “Exercício” no treino ativo abre o editor via `onAddExercise` e hoje o salvamento do editor pode persistir o template imediatamente.
- O fluxo de finalizar treino está em `finishWorkout()` do [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js) e já usa confirm/alert, então é o melhor lugar para encaixar a pergunta.

## Mudanças no Estado da Sessão (marcar alteração pendente)
- Ao iniciar sessão, gravar no `session.ui` um snapshot simples do treino-base (ex.: `baseExerciseCount` e/ou lista de nomes normalizados) para comparação.
- Quando o editor for aberto com `addExercise: true` e o usuário salvar o editor, marcar `session.ui.pendingTemplateUpdate = true`.

## Ajuste do Editor no Treino Ativo (não persistir automaticamente no template)
- Em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js):
  - Guardar em um ref/flag quando o editor foi aberto especificamente para “adicionar exercício”.
  - No `handleSaveActiveWorkoutEditor`, quando for esse caso:
    - Atualizar apenas `activeSession.workout` (e reindexar logs)
    - NÃO chamar `updateWorkout/createWorkout` naquele momento
    - Setar `session.ui.pendingTemplateUpdate = true`.

## Pergunta no Finalizar (e persistência se Sim)
- Em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js):
  - Antes de enviar `POST /api/workouts/finish` e/ou antes de `props.onFinish`, checar se houve exercício extra (`pendingTemplateUpdate` ou `exercises.length > baseExerciseCount`).
  - Se houve, perguntar: “Você adicionou exercício(s) extra(s). Deseja atualizar o treino para salvar essa mudança?”
  - Se “Sim”, chamar um novo callback `props.onPersistWorkoutTemplate(workout)`.

## Implementação do Persist (no parent)
- Em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js):
  - Implementar `onPersistWorkoutTemplate` usando as funções existentes:
    - Normalizar e limpar (`normalizeWorkoutForEditor` + `stripWorkoutInternalKeys`).
    - Se tiver `workout.id`, chamar `updateWorkout(workout.id, cleaned)`.
    - Se não tiver `id`, chamar `createWorkout(cleaned)`.
  - Após sucesso, atualizar a lista de treinos (`fetchWorkouts()` ou patch local) para refletir o novo exercício no template.

## Validação
- Caso A: adicionar exercício extra → finalizar → clicar “Não” → treino finaliza e template não muda.
- Caso B: adicionar exercício extra → finalizar → clicar “Sim” → template é atualizado e permanece na próxima vez que iniciar o treino.
- Caso C: erro ao salvar template → mostrar alerta, mas ainda permitir finalizar o treino.
- Rodar `lint` e `build` para garantir que a mudança compila.

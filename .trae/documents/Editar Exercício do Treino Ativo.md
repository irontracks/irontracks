## Objetivo
- Permitir editar o treino ativo “exercício por exercício” dentro do treino ativo.
- Manter o card do treino ativo com o mesmo padrão visual de botões, apenas acrescentando a ação pedida.

## Comportamento (UX)
- Em cada card de exercício do treino ativo ([ActiveWorkout.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.tsx#L2470-L2592)), adicionar um botão ícone **Editar** no mesmo estilo dos botões existentes (mesma altura, borda, label pequena).
- Ao clicar em **Editar**, abrir um modal no padrão já usado no treino ativo (overlay + container central com header, X e footer Cancelar/Salvar).

## O que o modal permite editar (inclui o nome)
- **Nome do exercício** (trocar/ajustar o nome)
- Sets (quantidade)
- Descanso (segundos)
- Método (Normal/Drop-set/Rest-Pause/Cluster/Bi-Set/Cardio)
- Campos básicos já existentes no exercício (ex.: reps padrão, RPE, cadência, notas) quando aplicável

## Regras de segurança (logs e finalização)
- Logs são indexados por `${exIdx}-${setIdx}`.
- Trocar **nome** não altera `exIdx`, então **não quebra logs**.
- Se reduzir `sets`, remover do `session.logs` as chaves desse exercício com `setIdx >= novoSets` para evitar payload com séries “fantasmas” (o payload envia `logs` inteiro: [finishWorkoutPayload.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/lib/finishWorkoutPayload.ts#L13-L51)).
- Se aumentar `sets`, completar `setDetails` com defaults para manter consistência do render.

## Implementação
1. **ActiveWorkout.tsx**
   - Adicionar estado local: `editExerciseOpen`, `editExerciseIdx`, `editExerciseDraft`.
   - Funções:
     - `openEditExercise(exIdx)` → monta o draft a partir do exercício atual.
     - `saveEditExercise()` → valida, normaliza (incluindo nome), aplica update no exercício e ajusta logs quando necessário.
   - UI:
     - Inserir botão **Editar** no header do card seguindo o layout padronizado.
     - Renderizar modal “Editar exercício” seguindo o mesmo layout de modais já existentes no arquivo.
   - Aplicar mudanças via `props.onUpdateSession({ workout: nextWorkout, logs: nextLogs })` (o dashboard já faz merge em [IronTracksAppClientImpl.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClientImpl.tsx#L3206-L3212)).

2. **(Opcional) Ajuste fino de layout dos botões**
   - Se faltar espaço no mobile, manter identidade e distribuir sem “inventar layout novo” (ex.: mover o indicador de colapso para a linha do título e preservar o grid de ações com 4 slots).

## Validação
- Manual:
  - Trocar nome do exercício e confirmar que atualiza o card e mantém logs funcionando.
  - Reduzir/aumentar sets com séries já preenchidas.
  - Finalizar treino e conferir que não gera erro.
- Rodar `npm run test:smoke`.

## Entregáveis
- Botão **Editar** por exercício no treino ativo.
- Modal “Editar exercício” no padrão visual existente.
- Atualização segura do exercício (inclui renomear) e limpeza de logs quando necessário.
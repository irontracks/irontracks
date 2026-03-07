## O que está acontecendo hoje
- O treino ativo usa `activeSession.workout` e registra séries em `activeSession.logs` com chaves por índice: `${exIdx}-${setIdx}` ([ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js)).
- Se o usuário altera a lista de exercícios durante o treino sem tratar logs, pode “embaralhar” o que já foi registrado.

## Objetivo
- Adicionar uma ferramenta de **Editar Treino** enquanto o treino está ativo.
- A interface deve ser **igual ao editor existente** (mesmas funções de adicionar/duplicar/remover/editar séries etc.), só que aberta por cima do treino ativo.

## Implementação (segura e completa)
### 1) Abrir o editor como modal durante o treino ativo
- Adicionar um botão “Editar treino” no header do `ActiveWorkout`.
- No `IronTracksAppClient`, manter `view === 'active'` e abrir um overlay modal renderizando `ExerciseEditor` com o treino atual.

### 2) Reaproveitar o mesmo editor e fluxo de save
- Reutilizar `ExerciseEditor` com as mesmas props usadas na tela de edição (onChange/onSave/onCancel/onSaved).
- Ao salvar:
  - Persistir o treino usando o mesmo `handleSaveWorkout` (criar/atualizar template).
  - Atualizar o treino ativo (`activeSession.workout = draft`) para refletir mudanças imediatamente.

### 3) Preservar o que já foi registrado (corrigir logs)
- Implementar um “reindexador” de logs quando a lista de exercícios mudar:
  - Mapear exercícios antigos → novos usando `exercise.id` quando existir; fallback por assinatura (nome + sets + método + descanso).
  - Recriar `logs` trocando somente o prefixo do índice (`oldIdx-*` → `newIdx-*`).
  - Remover logs de exercícios removidos e truncar logs de sets que não existem mais.
- Resultado: o que já foi feito continua associado ao exercício correto.

### 4) Verificação
- Cenário: iniciar treino, marcar algumas séries, abrir “Editar treino”, adicionar/duplicar/remover exercícios, salvar.
- Confirmar:
  - Treino continua ativo sem reset.
  - Logs feitos permanecem no exercício correto.
  - Relatório pós-finalizar não fica incorreto.

Se aprovado, eu implemento em `ActiveWorkout.js` e `IronTracksAppClient.js`, adiciono o modal com `ExerciseEditor` e o reindexador de logs.
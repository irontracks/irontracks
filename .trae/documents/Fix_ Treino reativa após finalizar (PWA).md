## Diagnóstico (causa mais provável)
- O app restaura treino ativo ao abrir usando:
  - localStorage `irontracks.activeSession.v2.${userId}` e fallback `activeSession`.
  - tabela `active_workout_sessions` no Supabase (se o estado do servidor for mais novo).
- Ao clicar em **Finalizar**, o app seta `activeSession=null`, mas:
  - o **delete no servidor** (`active_workout_sessions`) é feito com debounce (~900ms). Se o usuário fecha o PWA rápido, a sessão pode ficar no servidor e ser restaurada no próximo load.
  - a chave legada `activeSession` **não é removida** ao finalizar; se ela existir, o restore pode “ressuscitar” o treino.

## Objetivo
- Garantir que ao clicar em **Finalizar**, o treino seja encerrado de forma **irrecuperável** (não reativar no reload), sem depender de timers e sem impactar layout.

## 1) Correção server-side (mais importante)
- Alterar `POST /api/workouts/finish` para, após salvar o treino em `workouts`, também executar:
  - `delete from active_workout_sessions where user_id = user.id`
- Assim, mesmo que o usuário feche o PWA imediatamente, o estado ativo do servidor não sobrevive e não pode ser restaurado depois.

## 2) Correção client-side (higiene e compat)
- No fluxo de finalizar (handler no dashboard), remover imediatamente:
  - `localStorage.removeItem(scopedKey)` e **também** `localStorage.removeItem('activeSession')`.
- Opcional (robustez): gravar um marcador curto `irontracks.activeSession.finishedAt.${userId}` por alguns minutos e, no restore, se existir, ignorar qualquer sessão antiga e limpar (protege contra race/caches).

## 3) Ajuste do restore (evitar sessão inválida)
- No restore, além de validar `startedAt/workout`, também ignorar sessões com `endedAt/finishedAt` (se existir no state) e limpar storage.

## 4) Verificação (reprodução e prova)
- Cenário: iniciar treino → finalizar → fechar PWA imediatamente → reabrir.
- Verificar:
  - não entra em view `active`.
  - `active_workout_sessions` não tem linha para o usuário.
  - relatório usa apenas o treino salvo no histórico.

Se aprovado, eu implemento os ajustes em `/api/workouts/finish` e no `IronTracksAppClient.js`, e valido no PWA sem nenhuma mudança visual.
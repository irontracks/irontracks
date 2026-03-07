## O que já temos hoje (bom ponto de partida)
- Treino ativo já persiste localmente em `localStorage` (`irontracks.activeSession.v2.${userId}`), então **registrar séries sem internet já funciona em parte**.
- Quando tem internet, o app ainda sincroniza o estado via `active_workout_sessions` (multi-device).
- O “histórico” só é gerado quando o usuário finaliza e o app consegue dar `POST /api/workouts/finish`.

## Problema real do offline
- O gargalo não é “anotar o treino” (já fica local), e sim:
  - **Finalizar sem internet** (criar o registro em `workouts` no servidor).
  - **Reabrir a lista de treinos/templates sem internet** (dashboard bootstrap e telas dependem de fetch).
  - **Resolver conflitos** (offline em um device enquanto outro altera online).

## Objetivo (MVP offline que resolve a dor da academia)
1) Usuário consegue registrar o treino todo offline.
2) Ao tocar “Finalizar”, o app salva localmente como **pendente de envio**.
3) Quando a internet voltar, o app envia automaticamente e confirma.

## Fase 1 — MVP: finalizar offline com fila de sync (mais impacto)
### 1) Criar “fila de jobs” no client
- Persistir em IndexedDB (recomendado) ou localStorage (fallback) uma fila `offlineQueue` com itens:
  - `type: 'workout_finish'`
  - `userId`, `sessionPayload` (o JSON que hoje vai para `/api/workouts/finish`)
  - `idempotencyKey` (uuid)
  - `createdAt`, `attempts`, `lastError`
- Motivo: localStorage é frágil para payload grande; IndexedDB é mais seguro.

### 2) Detectar offline/online e rodar sync
- Criar um `SyncManager` no client que:
  - escuta `window.online/offline`
  - tenta `flushQueue()` quando ficar online
  - também tenta ao abrir o app (se já estiver online)

### 3) Ajustar “Finalizar treino” para modo offline
- Se `navigator.onLine === false` ou fetch falhar por rede:
  - enfileirar `workout_finish` com `idempotencyKey`
  - marcar UI do treino como “Finalização pendente”
  - manter o treino ativo no dispositivo até confirmar envio (ou mover para “pendentes”)

### 4) Idempotência no servidor (evitar duplicar histórico)
- Adicionar `idempotencyKey` no payload enviado para `/api/workouts/finish`.
- No backend, antes de inserir `workouts`, checar se já existe um workout com aquela key (armazenada em `workouts.notes` ou, idealmente, em uma coluna própria) e retornar ok sem duplicar.

## Fase 2 — Offline de navegação: abrir dashboard e templates sem internet
- Cache local (IndexedDB) do que é essencial:
  - lista de treinos/templates
  - últimos históricos (opcional)
- Ao carregar o dashboard:
  - mostrar cache imediatamente
  - atualizar quando houver internet
- Isso reduz “tela vazia” na academia.

## Fase 3 — Service Worker (PWA de verdade)
- Registrar um Service Worker simples para:
  - cache de assets estáticos
  - cache de algumas rotas GET (com cuidado)
  - (opcional) Background Sync (quando suportado)
- Como o app é Next App Router e tem muita rota dinâmica, a estratégia precisa ser bem seletiva.

## Conflitos e regras (para não dar dor de cabeça)
- Treino ativo: “last-write-wins” no device (offline manda o estado mais recente quando voltar).
- Histórico (workout_finish): idempotência garante que não duplica.
- Se o mesmo treino for finalizado em 2 devices, o servidor mantém 1 (pela idempotencyKey) e o outro job é descartado como já concluído.

## UX indispensável
- Badge de conectividade: “Offline”/“Sincronizando…”
- Lista “Pendentes”: exibir N treinos aguardando envio, com retry manual.

## Arquivos/pontos que vamos mexer
- Client do dashboard: [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js)
- Tela de treino ativo (finalização): [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js)
- Backend do finish: [finish/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/workouts/finish/route.ts)

## Entregável do MVP (Fase 1)
- Finalizar offline → entra em fila → envia sozinho quando online → confirma ao usuário.
- Sem duplicar histórico (idempotência).
- Status visual de offline/sync.

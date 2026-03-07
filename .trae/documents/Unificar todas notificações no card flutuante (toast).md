Você quer que **todas** as notificações (follow, treino, mensagem, convites, agenda, etc.) usem o mesmo **card flutuante** que já está funcionando no treino.

Hoje já existe o componente de toast, mas:
- algumas telas/tipos ainda dependem de modal (ex: `follow_request`)
- a Comunidade só mostra toast para alguns eventos
- `invite` pode não ter `sender_id`, então o toast precisa cair num fallback pelo `title`

## Objetivo
- Qualquer `INSERT` na tabela `notifications` deve poder gerar **toast flutuante** automaticamente, mantendo também o item no menu.
- A preferência `inAppToasts` continua mandando (se desligar, não mostra toast).

## Plano
1) **Implementar um listener único para toasts (reutilizável)**
- Implementar de verdade `src/components/RealtimeNotificationBridge.js` para:
  - assinar `postgres_changes` em `public.notifications` filtrando `user_id=eq.<userId>`
  - quando chegar uma notificação nova (não lida), montar payload do `NotificationToast` e chamar `setNotification`
  - deduplicar pelo `notification.id` para não disparar duas vezes
  - montar `senderName/photoURL` via `sender_id` quando existir; se não existir, usar fallback pelo `title`

2) **Dashboard: usar o mesmo card flutuante para TODOS os types**
- No `IronTracksAppClient.js`, manter o menu/badge de notificações, mas delegar o toast ao `RealtimeNotificationBridge`.
- Remover filtros especiais que impedem alguns types (ex: hoje `follow_request` foi tratado à parte).

3) **Follow request: substituir modal por toast (em qualquer tela)**
- Ajustar `FollowRequestModalGate.js` para não abrir modal.
- Ao receber `follow_request`, apenas disparar o mesmo toast flutuante.
- A ação de **Aceitar/Negar** continua no menu de notificações.

4) **Comunidade: mesmo comportamento do Dashboard**
- Em `CommunityClient.tsx`, usar o mesmo bridge (ou uma versão local) para mostrar toast para follow_request e demais notificações que chegarem (workout_start, friend_online, etc.).

5) **Validação**
- Gerar/receber pelo menos 1 notificação de cada grupo e confirmar:
  - aparece toast flutuante
  - fica no menu
  - `follow_request` não abre modal
  - `invite` aparece com texto certo mesmo sem `sender_id`

Arquivos que vou mexer:
- `src/components/RealtimeNotificationBridge.js`
- `src/app/(app)/dashboard/IronTracksAppClient.js`
- `src/components/FollowRequestModalGate.js`
- `src/app/(app)/community/CommunityClient.tsx`

Se você aprovar, eu implemento e testo os fluxos principais (follow_request, message, workout_start, invite).
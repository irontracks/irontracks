O que está acontecendo hoje (pelo código):
- O evento “Treino iniciado” é gravado como `type: 'workout_start'` em `public.notifications` via [/api/social/workout-start](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/workout-start/route.ts#L13-L51).
- O app tem um toast UI em [NotificationToast.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/NotificationToast.js), mas:
  - ele **não auto-fecha em 5s** (só fecha no X/click)
  - ele **não mostra avatar do remetente** porque o bridge seta `photoURL: null`
- O disparo do toast depende do bridge Realtime [RealtimeNotificationBridge.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/RealtimeNotificationBridge.js), que hoje só repassa `title/message` e não busca o perfil do remetente.

## Plano
1) **Adicionar auto-dismiss (5s) no toast**
- Ajustar `NotificationToast` para aceitar um `durationMs` (default 5000) e fazer `setTimeout(() => onClose())`.

2) **Mostrar avatar e nome de quem iniciou o treino**
- Ajustar `RealtimeNotificationBridge` para, ao receber uma notificação do tipo `workout_start`, buscar `profiles.display_name` e `profiles.photo_url` do `sender_id` e preencher `senderName/displayName/photoURL`.
- Manter cache simples em memória (Map) para não buscar o mesmo perfil a cada evento.

3) **Garantir que o toast apareça para `workout_start` e não conflite com modais**
- Opcional: ignorar tipos que já têm modal dedicado (ex: `follow_request`) para evitar duplicidade.

4) **Validação**
- Disparar um `workout_start` (pelo fluxo real do app) e confirmar:
  - aparece um toast flutuante
  - mostra o avatar/nome do remetente
  - some sozinho após ~5s
  - continua registrando na aba Notificações.

Se você confirmar, eu aplico as alterações nesses 2 arquivos (bridge + toast) e valido no /dashboard.
Não existe um skill pronto para isso (só o criador de skills), então vou propor e implementar diretamente no código.

# Esquema de Configurações (mais controle para o usuário)
Base: o modal atual já salva em `user_settings.preferences` (jsonb) via [useUserSettings.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/hooks/useUserSettings.js) e abre via [SettingsModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/SettingsModal.js).

## Itens novos (o que dá mais controle)
**A. Notificações**
- Mostrar/ocultar toasts no app (controla [NotificationToast.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/NotificationToast.js)).
- Não pedir permissão de notificações automaticamente (controla o request em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js)).
- Notificação ao fim do descanso (controla `Notification` em [RestTimerOverlay.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/RestTimerOverlay.js)).

**B. Som e Haptics**
- Volume do app (0–100%).
- Vibração no fim do timer (toggle).
- Repetição do alarme do timer (toggle) e intervalo.

**C. Treino (controle de execução)**
- Timer de descanso padrão (ex.: 60/90/120s).
- Contagem regressiva com “tick” nos últimos 5s (toggle — já existe gancho em [RestTimerOverlay.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/RestTimerOverlay.js)).

**D. Dados e Dispositivo**
- Exportar configurações (download JSON).
- Limpar caches locais (settings cache + outros caches do app).
- Resetar preferências para padrão.

**E. Privacidade/Interação (fácil e útil)**
- Já existe: Convites de treino em equipe.
- Adicionar: bloquear/permitir mensagens diretas (primeiro só no UI/rotas; parte avançada em backend na parte 2).

# Implementação em 2 partes
## 0) Antes de tudo: restauração local + backup GitHub (com data/hora)
- Criar branch/tag `snapshot-YYYYMMDD-HHMM`.
- Criar commit “Snapshot YYYY-MM-DD HH:MM”.
- Push para o GitHub (branch/tag) como backup.

## Parte 1 (entrega imediata, sem mexer em schema)
**Objetivo:** aumentar controle do usuário usando apenas `preferences` (jsonb) e ajustes client-side.
1. Estender defaults em [useUserSettings.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/hooks/useUserSettings.js) com novas chaves (ex.: `inAppToasts`, `notificationPermissionPrompt`, `restTimerDefaultSeconds`, `restTimerVibrate`, `soundVolume`, etc.).
2. Expandir UI do modal em [SettingsModal.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/SettingsModal.js) com seções novas (Notificações, Timer, Dados) seguindo o design system.
3. Aplicar preferências em pontos reais:
   - Condicionar render do toast em [NotificationToast.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/NotificationToast.js).
   - Respeitar prefs no timer em [RestTimerOverlay.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/RestTimerOverlay.js) (notificação, vibração, repetição, tick).
   - Ajustar “pedido de permissão” de notificações no bootstrap do app (em [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js)) para ficar controlado por setting.
4. Botões utilitários (export/reset/limpar cache) implementados dentro do modal.
5. Revisão/validação (3 passadas):
   - Passada 1: diagnostics/TypeScript.
   - Passada 2: `npm run build`.
   - Passada 3: smoke test (abrir modal, mudar prefs, recarregar, conferir comportamento do toast/timer).

**Ao final da Parte 1:** eu te pergunto explicitamente se podemos iniciar a Parte 2.

## Parte 2 (avanços: mais “controle de conta” e integrações)
1. Preferências de notificações por categoria (ex.: DM, convite, agenda) ligadas ao backend (Supabase) e/ou push real.
2. Privacidade real para chat (bloqueio efetivo no envio/recebimento, com regra/RLS).
3. Controle de sessão/segurança: “Sair de todos os dispositivos”, device list.
4. Rotina de exclusão/exportação de dados completa (LGPD), com confirmação forte.
5. Revisão/validação (3 passadas) e backup final no GitHub.

Se confirmar, começo executando o item 0 (snapshot/backup) e em seguida implemento a Parte 1 inteira.
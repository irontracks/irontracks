## Resultado da verificação (estado atual)
- O card flutuante à direita (toast) é o componente [NotificationToast.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/NotificationToast.js#L64-L90) e só aparece quando existe `notification` em state **e** `settings.inAppToasts !== false`.
- Esse `notification` é alimentado principalmente por INSERTs na tabela `public.notifications` via [RealtimeNotificationBridge.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/RealtimeNotificationBridge.js#L35-L70) (ele exige `title` e `message` não vazios).
- A central/menu de notificações ([NotificationCenter.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/NotificationCenter.js#L21-L71)) lista tudo do banco (`notifications`) e também agrega convites (`incomingInvites`) do [TeamWorkoutContext.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/contexts/TeamWorkoutContext.js#L25-L171).

## Conclusão
- **Não**, não dá pra afirmar que **TODAS** as notificações que vão pro menu também vão gerar o toast.
- Garantido hoje: **notificações que viram row em `notifications` com `title` + `message`** e quando a bridge/toast está montada (ex.: dashboard e community) e `inAppToasts` ligado.
- **Não garantido:** itens que entram no menu via `incomingInvites` (convites) — eles podem aparecer no menu mesmo sem existir row correspondente em `notifications`, então podem não virar toast.

## Onde o toast está montado
- Dashboard/app: [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L1966-L1967) monta a bridge e [IronTracksAppClient.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient.js#L2319-L2338) renderiza o toast.
- Comunidade: [CommunityClient.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/community/CommunityClient.tsx#L553-L562).

## Plano para garantir “TODAS geram toast” (se você quiser)
1) Mapear todas as fontes de notificação (notifications table, invites, follow/story, direct message, broadcast).
2) Centralizar num `NotificationProvider` (um único lugar no app) que:
   - assina `notifications` (bridge)
   - recebe eventos locais (ex.: convites) via callback/context
   - dispara **sempre** `NotificationToast` e também atualiza a central/menu.
3) Para convites (`incomingInvites`), disparar toast no momento do INSERT em `invites` (respeitando `settings.inAppToasts` e `allowTeamInvites`).
4) Padronizar payload mínimo (`title`, `message`, `type`, `deep_link`) para que toast e menu tenham o mesmo conteúdo.
5) Validar com testes manuais (DM, convite, broadcast, story) e garantir que:
   - entra no menu
   - aparece toast (quando permitido)

Se aprovado, eu implemento essa centralização pra ficar “100% garantido”.
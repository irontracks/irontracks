Você está vendo 3 problemas diferentes, todos explicáveis pelo código atual:

1) **“Negar” dá erro `not found`**
- O endpoint [/api/social/follow/respond](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/follow/respond/route.ts) retorna 404 `not found` quando o pedido pendente já não existe (ex: o outro usuário cancelou, ou alguém já aceitou/negou antes).
- O menu de notificações ([NotificationCenter.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/NotificationCenter.js)) hoje mostra esse erro em alerta.

2) **Francine aparece como USER**
- O sistema usa roles `admin|teacher|user` (vide [resolveRoleByUser](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/auth/route.ts#L41-L68)).
- Na Comunidade nós exibimos `profiles.role` diretamente; se o perfil estiver com `role='user'` ou `USER`, aparece exatamente assim.

3) **Cards flutuantes não aparecem (só vai pro menu)**
- No dashboard existe apenas um “badge” de notificações; não existe um listener que crie toast quando chega uma linha nova em `notifications` (apenas em alguns casos internos). Por isso “Treino iniciado” fica só no menu.

## Plano
## A) Tornar “Negar/Aceitar” idempotente (sem erro)
- Ajustar o endpoint `/api/social/follow/respond` para:
  - se não existir mais pedido pendente, retornar `ok: true, already: true` (ao invés de 404)
  - sempre marcar a notificação `follow_request` como lida/limpar do menu
- Ajustar o `NotificationCenter` para tratar `already: true` como sucesso (sem alert “not found”).

## B) Corrigir label de role na Comunidade
- Mapear `role` para label amigável:
  - `teacher` → “PROFESSOR”
  - `admin` → “ADMIN”
  - `user`/`USER`/null → “ALUNO” (ou “USUÁRIO”, se você preferir)
- Isso resolve o “Francine como USER” só na apresentação (sem mexer no banco).

## C) Implementar toast flutuante para notificações novas
- No dashboard (`IronTracksAppClient.js`), adicionar um realtime channel em `notifications` (INSERT):
  - ao receber uma notificação nova (ex: `workout_start`), chamar `setNotification({...})` para mostrar `NotificationToast`.
  - evitar duplicar toast: dedupe por `notification.id`.
  - respeitar `inAppToasts` (ou posso forçar para follow_request/treino ativo se você quiser que sempre apareça).

## D) Comunidade: toast de convite mesmo fora do dashboard
- Na página `/community`, adicionar também um realtime em `notifications` (INSERT) filtrando `type='follow_request'` para mostrar um toast simples “Fulano quer te seguir”.

## Validação
- Reproduzir:
  - abrir convite e clicar “Negar” quando o pedido já foi cancelado → não pode dar erro
  - Francine aparece como “ALUNO” (ou label escolhida)
  - receber `workout_start` → aparece toast e também fica no menu
  - receber `follow_request` na Comunidade → aparece toast + item no menu

Se confirmado, eu implemento nos arquivos:
- `src/app/api/social/follow/respond/route.ts`
- `src/components/NotificationCenter.js`
- `src/app/(app)/community/CommunityClient.tsx`
- `src/app/(app)/dashboard/IronTracksAppClient.js`
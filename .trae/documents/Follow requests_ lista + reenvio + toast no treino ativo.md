Pelo código atual, existem 3 causas prováveis para o que você está vendo:
- Na tela **/community** não existe `FollowRequestModalGate` nem `RealtimeNotificationBridge`, então o “convite” não aparece como popup/alerta ali (só aparece se o card “Pedidos para seguir” carregar corretamente).
- O popup de convite hoje é um **modal** (`FollowRequestModalGate`) que só existe no **/dashboard**.
- O card “Pedidos para seguir” depende de `social_follows` pendente (não das notificações). Se essa query estiver falhando (RLS/migrations/cache) o código atual engole o erro e mostra “Nenhuma solicitação pendente.”.

## Plano
1) **Fazer o card “Pedidos para seguir” realmente refletir a realidade**
- Em `CommunityClient.tsx`, passar a checar e tratar `error` em todas queries (`profiles`, `social_follows` enviados, `social_follows` recebidos).
- Se a query de recebidos falhar, exibir um erro amigável (ex: “Falha ao carregar pedidos para seguir”) ao invés de sempre mostrar vazio.
- Adicionar um fallback opcional: se `social_follows` falhar, carregar pedidos via `notifications` do tipo `follow_request` (metadata) apenas para não deixar a tela “morta”.

2) **Garantir que cancelar + pedir novamente SEMPRE notifique o convidado**
- Ajustar `/api/social/follow` para sempre “limpar e recriar” notificação `follow_request` quando um follow pending é criado:
  - antes de inserir a nova notificação, deletar qualquer `follow_request` anterior do mesmo remetente→destinatário (independente de `read`), evitando ficar preso em estados inconsistentes.
- Manter o comportamento atual de reenvio quando ocorrer duplicate+pending.

3) **Receber convite na tela Comunidade**
- Adicionar um toast simples na própria `CommunityClient.tsx` (usando `NotificationToast`) quando chegar um follow pendente via Realtime.
- O pedido continua aparecendo também no bloco “Pedidos para seguir”.

4) **Treino ativo: em vez de modal, mostrar card flutuante**
- Ajustar `FollowRequestModalGate` para receber `view` e `setNotification`.
- Se `view === 'active'`, não abrir modal: gerar um `NotificationToast` com avatar/nome (“Fulano quer te seguir”) e manter a notificação no menu.
- Em outras views, manter o modal atual (aceitar/negar).

5) **Validação end-to-end**
- Cenário A: A envia pedido → B vê no card “Pedidos para seguir” e recebe toast na Comunidade.
- Cenário B: A cancela e envia de novo → B recebe notificação de novo (menu + toast/modal conforme a tela).
- Cenário C: B está em treino ativo → aparece somente toast (sem travar a tela com modal).

Se você confirmar, eu implemento nos arquivos:
- `src/app/(app)/community/CommunityClient.tsx`
- `src/app/api/social/follow/route.ts`
- `src/components/FollowRequestModalGate.js`
- `src/app/(app)/dashboard/IronTracksAppClient.js` (apenas para passar props pro gate)
E valido tudo no dev server.
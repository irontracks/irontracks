Pelo fluxo atual, ao clicar em **Seguir** o sistema sempre cria um follow com `status = 'pending'` ([/api/social/follow](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/follow/route.ts#L19-L57)).

Isso impacta os dois pontos que você relatou:
- O botão fica como **Solicitado** porque está pendente.
- As notificações “Treino iniciado” só são enviadas para **followers aceitos** (`status = 'accepted'`) ([listFollowerIdsOf](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/lib/social/notifyFollowers.js#L11-L24)). Então, enquanto estiver “Solicitado”, você **não vai receber** o card flutuante de treino iniciado desse usuário.

## Plano
1) **Adicionar “Cancelar convite” quando status = pending**
- Na lista de usuários em [CommunityClient.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/community/CommunityClient.tsx), trocar o botão “Solicitado” por um botão clicável **Cancelar convite**.
- A ação vai deletar o registro de `social_follows` (follower_id = você, following_id = ele) e atualizar o state local.

2) **Criar endpoint de cancelamento para evitar ‘aceitar’ convite cancelado**
- Criar `/api/social/follow/cancel` usando service role (admin client) para:
  - deletar `social_follows` pendente
  - deletar a notificação `follow_request` enviada ao outro usuário (para ele não aceitar algo que já foi cancelado).

3) **Blindar o endpoint de responder convite**
- Ajustar [/api/social/follow/respond](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/follow/respond/route.ts) para só retornar `ok: true` no accept/deny se **realmente** existir um registro pendente para atualizar/deletar.
  - Se não existir (porque foi cancelado), retornar erro amigável (“Solicitação não encontrada ou já respondida”).

4) **(UX) Deixar claro o porquê do toast não aparecer**
- Na Comunidade, no estado pendente, exibir “Aguardando aprovação” e uma dica curta: “Notificações só após aceitar”.

5) **Validação**
- Fluxo A: clicar Seguir → aparece “Cancelar convite” → cancelar → some do pendente.
- Fluxo B: depois de cancelar, no outro usuário o “Aceitar” deve falhar com mensagem correta.
- Fluxo C: após **aceitar** o follow, disparar “Treino iniciado” e validar o toast flutuante.

Se aprovado, eu implemento isso (Community + novo endpoint + ajuste no respond) e valido no /community e /dashboard.
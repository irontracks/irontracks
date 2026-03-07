O erro que apareceu no seu print é literalmente a resposta do backend: `not found`.

Hoje o botão **Cancelar convite** chama `/api/social/follow/cancel`, que só cancela se existir uma linha em `social_follows` com:
- `follower_id = você`
- `following_id = a pessoa`
- `status = 'pending'`

Quando não existe mais uma linha pendente (porque já foi aceita, cancelada antes, ou os dados no client ficaram desatualizados), o endpoint retorna 404 e o front exibe o alerta “not found”.

## Plano
1) **Tornar o cancelamento idempotente (sem erro)**
- Ajustar [/api/social/follow/cancel](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/follow/cancel/route.ts) para:
  - se não achar a linha pendente, retornar `ok: true` com `already: true` (ao invés de 404).
  - opcional: checar se existe `accepted` e retornar uma mensagem mais clara (“já foi aceito, atualize a lista”).

2) **Sincronizar a UI após cancelar (ou quando não encontrar)**
- Em [CommunityClient.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/community/CommunityClient.tsx), no handler `cancelFollowRequest`:
  - se vier `already: true` (ou se vier “not found”), remover o pending do state local mesmo assim
  - disparar um `loadAll(userId)` para re-sincronizar (corrige casos em que já virou accepted e a UI ainda mostra pending)
  - trocar o alerta “not found” por mensagem amigável (“Convite já foi cancelado/aceito. Atualizando…”)

3) **Validação**
- Reproduzir o cenário:
  - usuário A envia pedido para B
  - B aceita rapidamente (ou A tenta cancelar depois)
  - A clica “Cancelar convite” e não pode quebrar: deve atualizar a UI corretamente (mostrar “Parar de seguir” se aceito, ou “Seguir” se removido).

Se você aprovar, eu aplico essas alterações (API + UI) e testo o fluxo completo.
## Resposta direta
- Hoje **não é em tempo real** para o seu amigo.
- Quem postou vê aparecer (porque a própria tela força refresh), mas o seguidor **só vê ao atualizar** (ou apertar “Atualizar” na seção Stories) / reabrir o Dashboard.

## Por que não é em tempo real hoje
- O endpoint de criar story só insere em `social_stories` e **não notifica seguidores**: [create route](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/stories/create/route.ts)
- O app tem realtime pronto para a tabela `notifications` via `RealtimeNotificationBridge`, mas Stories ainda não dispara um evento que faça a UI recarregar.

## Como vou deixar em tempo real (sem precisar recarregar a página)
### 1) Disparar notificação quando alguém posta story
- No `POST /api/social/stories/create`, após inserir o story:
  - buscar seguidores aceitos do autor (`listFollowerIdsOf`)
  - filtrar por preferência (usar a mesma chave de social, ex.: `notifySocialFollows`)
  - inserir `notifications` com `type: 'story_posted'` e metadata (author_id, story_id)

### 2) Quando o seguidor receber essa notificação, recarregar Stories automaticamente
- No `RealtimeNotificationBridge`, ao receber `type === 'story_posted'`:
  - disparar `window.dispatchEvent(new Event('irontracks:stories:refresh'))`
- O `StoriesBar` já escuta esse evento e faz `reload()`.

### 3) Validação
- Abrir 2 contas (autor e seguidor) em abas diferentes.
- Postar story como autor e confirmar que o seguidor vê o story aparecer no Dashboard sem refresh.
- Rodar lint/build.

Se você confirmar, eu implemento exatamente esse fluxo agora.
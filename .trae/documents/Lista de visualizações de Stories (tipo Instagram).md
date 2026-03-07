## Resposta direta
- Sim, dá para ter igual o Instagram.
- A base já está pronta: o app já grava visualizações em `social_story_views` quando alguém abre um story (já existe o endpoint `/api/social/stories/view`).
- O que falta hoje é **uma tela/aba no viewer** para o autor ver **quem visualizou**.

## Pontos importantes (privacidade)
- Por RLS, a tabela `social_story_views` permite SELECT só para o próprio viewer (e admin). Então para o autor ver a lista, vamos expor isso via um **endpoint backend** que valida “esse story é meu” e retorna os viewers.

## Plano de implementação
### 1) Criar endpoint “quem viu”
- Adicionar `GET /api/social/stories/views?storyId=...`.
- Fluxo:
  - `requireUser()`
  - buscar story por `id` e validar `author_id === auth.user.id`
  - buscar `social_story_views` do story (viewer_id, viewed_at) ordenado por viewed_at desc
  - buscar perfis (`profiles`) desses viewers (display_name, photo_url, role)
  - retornar lista pronta para UI

### 2) UI no StoryViewer (somente no seu story)
- No viewer, quando `isMine === true`, adicionar um botão tipo “👁 Visualizações”.
- Ao tocar, abrir um painel/modal (estilo Instagram) com:
  - total de visualizações
  - lista de usuários (foto, nome, role, horário “há X min/h/d”)
- Pausar o timer enquanto o painel estiver aberto (como já faz com comentários).

### 3) Ajustes opcionais
- Exibir um badge/contador no botão (usando o total retornado pela API).
- Cache simples em memória enquanto o viewer estiver aberto para não refazer fetch toda hora.

### 4) Validação
- Com 2 contas:
  - Conta A posta story
  - Conta B abre story
  - Conta A abre o story e confere a lista de visualizações com B
- Rodar lint/build.

Se você confirmar, eu implemento isso agora (endpoint + painel de visualizações no viewer).
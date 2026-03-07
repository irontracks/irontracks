## Objetivo
- Reaproveitar a imagem do resumo do treino (gerada no [StoryComposer.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/StoryComposer.js)) para permitir **postar no próprio IronTracks**.
- Implementar um “Stories” igual ao Instagram:
  - Postagem visível por **24h**
  - Avatar com **anel vermelho** (não visto), **anel cinza claro** (já visto), **sem anel** (sem stories)
  - Permitir **curtir** e **comentar**

## Escopo (MVP)
### 1) Banco (Supabase)
- Criar tabelas:
  - `social_stories` (id, author_id, media_path, created_at, expires_at, caption/meta opcional)
  - `social_story_views` (story_id, viewer_id, viewed_at) para controlar anel vermelho/cinza
  - `social_story_likes` (story_id, user_id, created_at) para curtir
  - `social_story_comments` (id, story_id, user_id, body, created_at)
- RLS:
  - Só o autor insere/deleta seu story.
  - Leitura/interações permitidas para **seguidores aceitos** (usando `social_follows` status `accepted`) e o próprio autor.
  - Admin consegue listar (via `public.is_admin()`).
- Expiração:
  - `expires_at = created_at + interval '24 hours'`.
  - Queries sempre filtram `expires_at > now()` (sem precisar job para funcionar).

### 2) Storage (mídia)
- Criar bucket dedicado (ex.: `social-stories`) e usar **signed upload** semelhante ao chat, mas com regra de path `authorId/stories/storyId.jpg`.
- Fornecer **signed read URL** para exibir story sem deixar o bucket público.

### 3) API (Next.js)
- Endpoints:
  - `POST /api/social/stories/create` (grava metadata após upload)
  - `GET /api/social/stories/list` (retorna stories ativos agrupados por autor + status visto/não visto)
  - `POST /api/social/stories/view` (marca como visto)
  - `POST /api/social/stories/like` (toggle like)
  - `GET/POST /api/social/stories/comments` (listar/adicionar)
- Todos exigem usuário autenticado.

### 4) UI/UX
- **Barra de Stories** no topo do Dashboard/Comunidade:
  - Scroll horizontal com avatar + anel (vermelho/cinza/nenhum).
  - O próprio usuário aparece primeiro (com botão “+” quando não tiver story ativo).
- **Story Viewer (modal fullscreen)**:
  - Exibe a imagem (9:16), progresso, fechar.
  - Botão curtir + contador.
  - Lista de comentários + input (enviar).
  - Tap/click para avançar entre stories do mesmo autor.
- **Botão “Postar no IronTracks”** dentro do fluxo atual do relatório do treino:
  - Em [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/WorkoutReport.js), junto do modal que já abre o StoryComposer.
  - Usa o mesmo JPG gerado hoje (Blob), faz upload + cria registro do story.

## Validação
- Cenários:
  - Usuário posta story → aparece no próprio avatar com anel vermelho para seguidores.
  - Seguidor abre → marca visto (anel cinza).
  - Após 24h some da lista.
  - Curtir e comentar funcionam e respeitam RLS.
- Rodar `npm run lint` e `npm run build`.

## Pós-MVP (opcional)
- Remoção automática dos arquivos expirados no bucket (cron).
- Reações além de like.
- Responder comentário, mentions, highlights.

Se você confirmar, eu implemento esse MVP completo (migrations + APIs + UI), reaproveitando exatamente a imagem do StoryComposer.
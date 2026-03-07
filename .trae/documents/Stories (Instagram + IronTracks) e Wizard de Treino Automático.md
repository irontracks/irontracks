## Resposta direta

Sim — dá para **reaproveitar exatamente o sistema de Stories que já existe** (Storage + signed upload + `social_stories`) e **passar a aceitar vídeos** com mudanças pequenas e localizadas, sem criar novas tabelas nem mexer na arquitetura.

Hoje o fluxo está preparado só para **imagem**:
- Upload: `accept="image/*"` e valida MIME/size como imagem em [StoriesBar.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StoriesBar.tsx#L178-L198)
- Backend: bloqueia por extensão em [create/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/stories/create/route.ts#L8-L20)
- Viewer: sempre renderiza `next/image` (não suporta vídeo) em [StoriesBar.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StoriesBar.tsx#L602-L608)

## Plano (mínimo de mudanças, bem “premium”)

### 1) Permitir seleção e validação de vídeo no upload

- Atualizar o input para aceitar `image/*,video/*`.
- Validar MIME de `image/` **ou** `video/`.
- Ajustar limite de tamanho: manter 12MB para imagem e usar um limite maior para vídeo (ex.: 50MB) — ainda simples e seguro.
- Preservar o padrão existente (sem libs novas, sem mudar o endpoint).

Arquivo: [StoriesBar.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StoriesBar.tsx)

### 2) Gerar `path` com extensão correta para vídeo

- Hoje o código força `.jpg`/`.png`/`.jpeg` e cai em `.jpg` por default.
- Alterar para detectar extensão real do arquivo e permitir whitelist:
  - imagens: `.jpg`, `.jpeg`, `.png`
  - vídeos: `.mp4` (e opcionalmente `.mov`, `.webm` se você quiser)
- Manter o mesmo padrão de path `${uid}/stories/${storyId}${ext}`.

Arquivo: [StoriesBar.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StoriesBar.tsx#L77-L102)

### 3) Liberar vídeo no backend (sem migration)

- Atualizar a validação de extensão em `isAllowedStoryPath` para aceitar também extensões de vídeo.
- Não precisa mexer no bucket nem no signed-upload (ele já só valida path seguro e prefixo do usuário).

Arquivo: [create/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/stories/create/route.ts#L8-L20)

### 4) Renderizar vídeo no viewer (sem criar novo componente)

- Detectar se o `story.mediaUrl` aponta para um vídeo (pela extensão do pathname da URL assinada).
- Se for vídeo:
  - Renderizar um `<video>` com `playsInline`, `autoPlay`, `muted` (para iOS auto-play), e `controls={false}`.
  - Ajustar o “tempo do story” para seguir a duração do vídeo (via `onLoadedMetadata`) e avançar no `onEnded`.
- Se for imagem: manter `next/image` como está.

Arquivo: [StoriesBar.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/StoriesBar.tsx#L602-L608)

### 5) Checklist de verificação (para garantir que não quebra nada)

- Upload de imagem continua funcionando (JPG/PNG).
- Upload de vídeo MP4 funciona e gera signed URL.
- Viewer abre vídeo e reproduz.
- Auto-avanço: imagem (5s) e vídeo (duração real / fim do vídeo).
- Curtir, comentar, views e delete continuam funcionando.

## Escopo intencional (para “não adicionar muito coisa”)

- Sem novas tabelas/colunas.
- Sem novos endpoints.
- Sem libs.
- Sem integração “post automático no Instagram” (continua sendo share manual).

Se você aprovar este plano, eu implemento isso direto e já valido rodando o app e testando upload/view/delete.

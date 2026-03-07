## Como está HOJE (fluxo atual)
### Stories (dentro do app)
- Upload assinado no bucket `social-stories` → cria registro em `social_stories` → aparece no feed por follow `accepted` e expira em 24h.
- Arquivos principais:
  - UI: [StoriesBar.tsx](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/dashboard/StoriesBar.tsx)
  - Upload token: [signed-upload/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/storage/social-stories/signed-upload/route.ts)
  - Create/list/like/view/comments/views/media/delete: rotas em `src/app/api/social/stories/*`

### Modal do relatório (WorkoutReport)
- Botão **Compartilhar**: compartilha o arquivo do relatório (Web Share API / download). Não vira story.
- Botão **Foto**: abre o **StoryComposer**, que gera uma arte 1080×1920 e oferece:
  - “Compartilhar” (JPG via `navigator.share(files)` ou download)
  - “Postar no IronTracks (24h)” (faz upload + cria story)
- Arquivos: [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/WorkoutReport.js) + [StoryComposer.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/StoryComposer.js)

---

## Por que hoje está bugando (causa raiz)
- O `StoryComposer` tem um `useEffect` que **reseta o estado sempre que `backgroundUrl` muda**.
- Resultado:
  - você seleciona foto/vídeo → o código seta `backgroundUrl` (blob URL) → o effect roda e limpa `mediaKind/backgroundUrl/selectedFile` → preview fica vazio/volta pro default.
  - para **vídeo**, isso praticamente impede o preview de aparecer (o estado volta para `image` antes do `<video>` renderizar).
- Onde acontece: [StoryComposer.js:L523-L553](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/StoryComposer.js#L523-L553)

Problemas secundários que aumentam o “às vezes”:
- `objectURL` pode ser revogado cedo demais (race com `Image.onload`).
- Re-selecionar o mesmo arquivo pode não disparar `onChange` (input mantém o value), então parece que não carregou.

---

## O que vamos fazer para ficar 100% confiável (refatoração/“V2”)

### 1) Refazer o gerenciamento de estado do StoryComposer (sem resets acidentais)
- Separar claramente:
  - estado de UI do modal (open/close)
  - estado do background selecionado (tipo, file, objectURL, status)
- Remover qualquer `useEffect` que dependa de `backgroundUrl` para reset.
- Reset só quando:
  - o modal fecha, ou
  - o usuário clica explicitamente em “Remover mídia”.

### 2) Pipeline de preview robusto (imagem e vídeo)
- Criar um “media controller” interno:
  - `selectedFile` → gera `objectURL` → seta `previewUrl` → render.
  - cleanup do `objectURL` só quando trocar o arquivo ou fechar.
- Preview de vídeo:
  - `<video key={previewUrl} ...>` para forçar remount ao trocar mídia.
  - handlers `onLoadedMetadata/onCanPlay/onError` para status “carregando/ok/erro”.
  - `muted playsInline controls` (essencial no iOS/Safari) e tentativa de `play()` com try/catch.
- Preview de imagem:
  - carregar com `Image()` e só renderizar como background quando `onload` concluir.

### 3) UX de confiabilidade
- Mostrar estados explícitos:
  - “Carregando mídia…”
  - “Falha ao carregar vídeo/foto” com botão “Tentar novamente”.
- Limpar `input.value = ''` após ler o arquivo para permitir selecionar o mesmo arquivo de novo.

### 4) Integração com o relatório
- Garantir que abrir o modal sempre inicializa corretamente:
  - passar um `key`/reset token por `open` do `WorkoutReport` para o compositor (evita estado preso).

### 5) Validação (cenários reais)
- Foto:
  - selecionar → aparece sempre no preview na primeira tentativa
  - fechar/abrir → continua consistente
  - selecionar o mesmo arquivo novamente → funciona
- Vídeo:
  - selecionar → aparece no preview (e dá play quando permitido)
  - troca de vídeo → preview troca sem “ficar preto”
- iPhone/Safari (playsInline) e Chrome/Android.
- Rodar `npm run lint` e `npm run build`.

---

## Arquivos que serão mexidos
- Principal: [StoryComposer.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/StoryComposer.js)
- Integração: [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/WorkoutReport.js)

Se você aprovar, eu implemento a V2 mantendo as 2 ações atuais: **Compartilhar JPG** e **Postar no IronTracks (24h)**, mas com preview estável para foto e vídeo.
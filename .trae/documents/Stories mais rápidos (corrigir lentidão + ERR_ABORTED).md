O “lento” aqui está vindo principalmente de 2 coisas: (1) o endpoint de lista assina URL de mídia story-a-story (sequencial), atrasando o carregamento inicial; (2) o browser aborta requests quando o src muda/preload acontece, gerando `net::ERR_ABORTED` (não é necessariamente bug, mas gera ruído e pode indicar re-fetch desnecessário).

## Diagnóstico dos 3 logs
- `net::ERR_ABORTED …/storage/v1/object/sign/...`:
  - O request do vídeo foi cancelado (troca de story, preload, ou troca de src). É comum em players quando a UI avança rápido.
  - Também acontece quando a lista recarrega e gera uma URL assinada nova (token novo), abortando a anterior.
- `net::ERR_ABORTED …/rest/v1/workouts?...`:
  - Request cancelado por navegação/refresh/unmount (efeito colateral, geralmente não quebra funcionalidade).

## 1) Deixar o “/stories/list” rápido
- Alterar [api/social/stories/list/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/stories/list/route.ts) para NÃO fazer `createSignedUrl()` para todos os stories.
- Em vez disso, retornar `mediaUrl` como uma URL same-origin estável (ex.: `/api/social/stories/media?storyId=...&signedSeconds=3600`).
  - Resultado: a barra de stories aparece instantaneamente e só assina/baixa mídia quando o usuário abre o viewer.

## 2) Tornar o “/stories/media” mais eficiente
- Ajustar [api/social/stories/media/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/stories/media/route.ts) para:
  - Em vez de “proxy streaming” (baixar e re-enviar bytes), responder com **redirect 307** para a URL assinada do Supabase.
  - Manter `signedSeconds` maior (ex.: 3600) e headers de cache, reduzindo re-fetch.
  - Isso diminui latência e carga no servidor Next (o navegador baixa direto do Storage).

## 3) Preload sem gerar aborts/ruído e mais fluidez na troca
- No [StoryViewer.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/stories/StoryViewer.tsx):
  - Pré-carregar próximo/anterior chamando `fetch` na rota same-origin com `Range: bytes=0-0` (aquecimento leve), ao invés de criar elementos `<video>` extras (que costumam gerar aborts quando limpamos o src).
  - Reaproveitar um pool de preload (2 entradas) para reduzir cancelamentos.

## 4) Progress bar mais suave
- Trocar o update de `progress` para um modo ainda mais leve:
  - Para vídeo: ler `currentTime` com throttle, mas atualizar só quando muda “visivelmente”.
  - Para imagem: usar timer com menos setState.

## 5) Validação
- Rodar `npm run build`.
- Testar abertura e troca rápida de stories e confirmar redução de `ERR_ABORTED` e ganho de tempo no “primeiro story abrir”.

Se você confirmar, eu começo pelo item 1+2 (são os que mais impactam “abrir rápido”).
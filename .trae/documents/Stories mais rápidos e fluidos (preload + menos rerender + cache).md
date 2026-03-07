Vou deixar o Story abrir e tocar mais rápido atacando 3 gargalos: (1) latência de rede (assinatura/proxy), (2) buffer/decoding de mídia, (3) re-render excessivo durante a barra de progresso.

## 1) Abrir mais rápido (rede)
- **Parar de depender do proxy em toda reprodução**: no [StoryViewer.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/stories/StoryViewer.tsx), vou buscar **URL assinada** via POST em `/api/social/stories/media` para o story atual e usar essa URL direto no `src` do `<video>`/`<img>`.
- **Cache em memória**: manter um cache `{storyId -> signedUrl + expiresAt}` para não re-solicitar assinatura ao voltar/avançar rapidamente.
- **Ajustar cache do proxy (fallback)**: em [route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/social/stories/media/route.ts) aumentar `Cache-Control` de `max-age=60` para algo como `max-age=600` (ou alinhado ao `signedSeconds`), reduzindo re-fetch quando o proxy for usado.

## 2) Assistir mais fluido (preload/buffer)
- **Pré-carregar próximo/anterior**: quando abrir um story, pré-buscar (em paralelo) as URLs assinadas do **próximo e anterior** e “aquecer” o buffer:
  - Vídeo: criar um `<video preload="metadata" muted playsInline>` invisível (ou usar `video.load()` num elemento offscreen) apontando para a URL do próximo.
  - Imagem: `new Image().src = url` para pré-cache.
- **Estados de loading**: mostrar um overlay leve de “carregando” até `onLoadedMetadata/onCanPlay`, para dar sensação de instantâneo.

## 3) Barra de progresso sem travar (menos re-render)
Hoje o viewer atualiza `setProgress()` muitas vezes por segundo (RAF), o que pode causar re-render e micro-engasgos.
- Vou mudar para:
  - **Atualização direta via refs** (alterar width/transform do elemento ativo no DOM) **sem setState por frame**, ou
  - **Throttle** para ~30fps.
Isso reduz trabalho do React e melhora a suavidade.

## 4) Garantias e validação
- Manter padrão “Instagram”: vídeo inicia **muted** e o usuário ativa som no botão.
- Validar com `npm run build`.
- Testar abertura de story em sequência (próximo/anterior) e medir tempo até começar a tocar.

Se você confirmar, eu implemento essas mudanças começando pelo preload + cache de URL assinada no viewer (maior ganho perceptível).
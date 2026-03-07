O vídeo ficar preto no “Baixar / Compartilhar” acontece porque o export de vídeo do modal (StoryComposer) grava um `canvas.captureStream()` e desenha os frames via `ctx.drawImage(video, ...)`, mas **não espera o vídeo realmente “estar no frame”** após `currentTime = trimRange[0]`. Em Safari/iOS isso é clássico: `drawImage(video, ...)` rende preto até o primeiro frame decodificar (e o código já começa o `MediaRecorder` antes disso). Resultado: arquivo final = fundo preto + overlays.

Referência do fluxo atual:
- Botão “BAIXAR / COMPARTILHAR” -> `shareImage()` -> `createImageBlob()` -> `renderVideo()` em [StoryComposer.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/StoryComposer.tsx#L901-L1006)

## 1) Esperar seek + primeiro frame antes de gravar
- Dentro de `renderVideo()`:
  - Após `video.pause()` e `video.currentTime = trimRange[0]`, aguardar evento `seeked`.
  - Em seguida, aguardar “primeiro frame pronto”:
    - Preferir `video.requestVideoFrameCallback` (quando disponível).
    - Fallback: aguardar `loadeddata` e validar `video.videoWidth > 0`/`video.videoHeight > 0`.
  - Só então iniciar `recorder.start()` e o loop de desenho.

## 2) Guardas para evitar desenhar com vw/vh=0
- No loop de desenho:
  - Se `video.videoWidth`/`video.videoHeight` ainda forem 0, pular o `drawImage` e aguardar próximo frame (não avançar gravação “no escuro”).

## 3) Ordem correta de gravação
- Desenhar 1 frame inicial no canvas (vídeo + overlay) antes de iniciar o recorder (evita “primeiros segundos pretos”).

## 4) MIME mais robusto por browser
- Ajustar seleção de `mimeType` do `MediaRecorder`:
  - Safari: tentar `video/mp4`.
  - Chrome/Edge/Firefox: preferir `video/webm;codecs=vp9`/`vp8`.
  - Se nada suportar, falhar com erro amigável.

## 5) Validação
- Testar no modal do relatório:
  - Carregar vídeo, escolher layout, “Baixar / Compartilhar” e verificar que o arquivo final tem **vídeo + layout**.
- Rodar `npm run build`.

Se você confirmar, eu implemento esses ajustes no [StoryComposer.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/StoryComposer.tsx) e valido o download/compartilhamento.
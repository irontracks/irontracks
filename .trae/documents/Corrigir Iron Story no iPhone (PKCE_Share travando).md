## Diagnóstico (baseado no código)
- No celular (iOS), o export do story de vídeo usa `MediaRecorder` e escolhe o mime por `isTypeSupported`. Quando `video/mp4` não é suportado, ele cai para `video/webm` ([StoryComposer.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/StoryComposer.tsx#L931-L965)).
- iPhone/iOS tem suporte fraco a `webm` (e frequentemente não compartilha/decodifica), então:
  - “BAIXAR / COMPARTILHAR” pode falhar e cair no `catch` genérico (“Não foi possível compartilhar.”) ([StoryComposer.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/StoryComposer.tsx#L1108-L1122)).
  - Ao postar, o story pode ficar travado no viewer porque o player só faz `<video src=...>` sem fallback; se o arquivo for `webm` ou bitrate alto, ele engasga ([StoryViewer.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/stories/StoryViewer.tsx#L383-L401)).
- Além disso, o export está em 1080x1920 @ 30fps e bitrate 12–16 Mbps, o que é pesado para iPhone e pode travar/OOM.

## Correção (o que vou implementar)
### 1) Export de vídeo “compatível com iPhone”
- Melhorar a detecção de iOS (não só “Safari”) e priorizar `mp4` com codecs explícitos (ex.: `video/mp4;codecs="avc1.42E01E,mp4a.40.2"`) antes de qualquer `webm`.
- Em iOS, reduzir custo do export:
  - fps 24
  - bitrate menor (ex.: 4–6 Mbps)
  - áudio menor (ex.: 96 kbps)
  - opcional: export em 720x1280 (mantendo preview em 1080x1920) para evitar travadas.

### 2) Mensagens e fallbacks melhores no botão “BAIXAR / COMPARTILHAR”
- Diferenciar cancelamento do share sheet (`AbortError`) de falha real (não mostrar erro quando o usuário cancela).
- Quando o erro for de codec/suporte do navegador, mostrar mensagem específica (ex.: “Seu iPhone não suporta exportar vídeo com layout neste navegador; tente Safari/Chrome atualizado ou poste como imagem”).

### 3) Viewer resiliente (evitar “story travado”)
- Se detectar iOS + URL/metadata indicando `webm`, mostrar fallback (mensagem amigável + botão para pular) em vez de ficar travado.
- Ajustar handlers do `<video>` (onError/onStalled) para avançar automaticamente após alguns segundos se não carregar.

## Validação
- Reproduzir export local (desktop) para garantir que nada quebra.
- Testar no iPhone:
  - gerar story com layout → “BAIXAR / COMPARTILHAR”
  - postar no IronTracks e abrir no StoryViewer
  - confirmar que o arquivo final é `.mp4` e não trava.

Se você confirmar, eu aplico essas mudanças e já deixo o fluxo de vídeo no iPhone estável e com fallback quando o device não suportar.
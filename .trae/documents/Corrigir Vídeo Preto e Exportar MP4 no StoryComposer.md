## Diagnóstico (atual)
- O modal do print é o [StoryComposer.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/StoryComposer.js).
- Para vídeo, hoje ele só permite **postar no IronTracks**, e a opção “Compartilhar (JPG)” fica desabilitada (`disabled={busy || isVideo}`), então realmente não existe opção de **salvar/baixar mp4**.
- O preview de vídeo depende de `<video src={backgroundUrl}>`. Em alguns browsers/PWA isso pode ficar “preto” quando o elemento não reinicializa bem ao trocar blob URL, ou quando o autoplay não engata.

## Objetivo
- No mesmo modal:
  1) parar de ficar preto ao selecionar vídeo
  2) oferecer botão para **baixar/compartilhar o vídeo (mp4)**

## Mudanças mínimas (1 arquivo)
### 1) Corrigir preview preto
- Alterar o `<video>` para:
  - recriar ao trocar o arquivo (`key={backgroundUrl}`)
  - forçar `play()` ao carregar metadados (`onLoadedMetadata`/`onCanPlay`) com try/catch
  - capturar 1 frame inicial e setar como `poster` (evita tela preta enquanto carrega)
  - adicionar `onError` para mostrar erro claro (“Vídeo não suportado / codec inválido”).

### 2) Adicionar “Salvar/Compartilhar MP4”
- Criar função `shareVideo()` usando o `selectedFile`:
  - se `navigator.share` suportar `files`, compartilhar
  - senão, fazer download do próprio arquivo (mp4/mov) via `downloadBlob(selectedFile, nome)`
- Adicionar botão no final:
  - quando `isVideo`: mostrar “Compartilhar (MP4)” (ou “Compartilhar (VÍDEO)” se não for mp4)
  - quando não for vídeo: mantém “Compartilhar (JPG)” como está.

## Arquivo que será alterado
- Somente [StoryComposer.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/StoryComposer.js)

## Validação
- Selecionar um vídeo MP4 no modal:
  - preview aparece (sem ficar preto)
  - botão “Compartilhar (MP4)” baixa/compartilha o arquivo
- Selecionar foto:
  - “Compartilhar (JPG)” continua funcionando igual.

Obs.: Se o vídeo for HEVC/H.265 (comum em iPhone), alguns dispositivos/browsers podem realmente não decodificar; nesse caso a UI vai mostrar erro claro. A solução definitiva aí seria transcodificar no upload, mas isso já não é “mudança simples”.
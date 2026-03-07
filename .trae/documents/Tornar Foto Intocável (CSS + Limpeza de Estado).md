Vou deixar a foto **100% fixa** e garantir que **1 dedo só role o modal**, sem qualquer zoom/pan (nem “por acidente” no iPhone).

## 1) Remover zoom/pan do Story
- Em [StoryComposer.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/StoryComposer.js), vou **remover** estados/refs de `zoom` e `offset`.
- Em `drawStory(...)`, vou desenhar o background **apenas em cover centralizado**, sem multiplicador de zoom e sem deslocamento.

## 2) Bloquear pinch-zoom do iOS apenas dentro do modal
- Ainda em [StoryComposer.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/StoryComposer.js), vou adicionar um `useEffect` quando `open=true` que adiciona listeners `gesturestart/gesturechange/gestureend` com `preventDefault()` (passive:false). Isso evita o Safari fazer zoom da página enquanto o modal está aberto.

## 3) Manter scroll nativo
- Sem handlers de ponteiro e sem `touch-action` agressivo na área da foto, o **scroll vertical** fica 100% do navegador.

## Validação
- Testar no iPhone em `http://192.168.100.2:3000`.
- Se ainda aparecer comportamento antigo, forçar refresh no iPhone (fechar aba e abrir de novo) para limpar cache do dev-server.

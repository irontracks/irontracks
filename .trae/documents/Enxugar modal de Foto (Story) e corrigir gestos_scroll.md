## Objetivo
- Deixar o modal de Foto (Story) bem mais enxuto.
- Remover completamente: Efeitos (Clean/Pop/…), slider de Zoom, sliders de Vignette e Grain.
- Corrigir o problema de arrastar para cima/baixo que hoje move o fundo em vez do modal.
- Manter zoom apenas por gestos (pinch).

## Diagnóstico do Estado Atual
- O modal é o [StoryComposer.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/StoryComposer.js).
- Ele ainda tem:
  - seletor de `storyPresets` (efeitos),
  - sliders de `zoom`, `vignette`, `grain`,
  - e o overlay não bloqueia 100% o gesto de scroll/bounce no mobile (por isso o “arrastar” afeta o fundo).

## Mudanças Planejadas (somente no modal de Foto)
### 1) Remover efeitos e sliders
- Remover do UI:
  - bloco “Efeito” (presets),
  - bloco de “Zoom” (range),
  - sliders de “Vignette” e “Grain”.
- Remover do estado e do desenho:
  - `preset`, `vignette`, `grain` e o array `storyPresets`.
- Fixar um visual único (clean/strava-like) direto no `drawStory` (sem variações de presets).

### 2) Zoom por gestos (pinch)
- Implementar pinch com Pointer Events no preview:
  - rastrear 2 ponteiros ativos,
  - calcular razão de distância (pinch) e atualizar `zoom`.
  - manter drag 1 dedo para reposicionar.
- Definir limites de zoom (ex.: 1.0–1.8) como hoje.

### 3) Corrigir “arrastar mexe o fundo”
- Blindar o overlay contra scroll/bounce:
  - aplicar `touch-action: none` no overlay (e/ou container do sheet),
  - garantir `overscroll-behavior: none/contain` no overlay,
  - adicionar cancelamento de scroll no container do modal para impedir que o gesto caia no background.
- Manter `touch-action: none` no preview para que pinch/drag sejam 100% controlados pelo componente.

### 4) UI final enxuta
- Layout final sugerido:
  - header (título + fechar)
  - preview
  - botões: “Escolher Foto” e “Compartilhar (JPG)”
  - (opcional) manter “Guia On/Off” se você quiser; caso contrário removo também.

## Validação
- Testar no desktop e no mobile em modo responsivo:
  - scroll do fundo não mexe com modal aberto,
  - drag move a imagem,
  - pinch altera zoom,
  - export continua gerando JPG.

## Arquivos afetados
- Apenas: `src/components/StoryComposer.js`

Se você confirmar, eu aplico essas mudanças direto no StoryComposer, valido com build e subo no main.
# Plano — Corrigir Drag e Remoção em StoryCreatorModal

## Objetivo

Corrigir dois bugs em `src/components/stories/StoryCreatorModal.tsx`:

* BUG 1: Drag de overlays usa `info.point` (coordenadas absolutas) e causa saltos. Trocar para usar `info.offset` (delta do drag) convertido em porcentagem e somado à posição atual do overlay.

* BUG 2: Garantir que o botão de remover overlay responda a cliques mesmo com `pointer-events-none` no container pai, preservando `e.stopPropagation()`.

## Contexto atual

* Camada de overlays: `<div className="absolute inset-0 pointer-events-none overflow-hidden">` e cada overlay é um `<motion.div className="absolute pointer-events-auto ...">` com botão `<button onClick={(e) => { e.stopPropagation(); removeOverlay(ov.id); }} ...>`.

* `handleDragEnd` hoje calcula:

  ```ts
  const x = ((info.point.x - rect.left) / rect.width) * 100;
  const y = ((info.point.y - rect.top) / rect.height) * 100;
  ```

  Isso usa `info.point` e ignora a posição atual do overlay, gerando saltos.

## Mudanças planejadas (cirúrgicas)

### BUG 1 — Corrigir cálculo de drag

* Dentro de `handleDragEnd(id, info)`:

  1. Obter `rect = containerRef.current.getBoundingClientRect()`.
  2. Ler `dx = info.offset?.x || 0` e `dy = info.offset?.y || 0`.
  3. Converter para porcentagem do container:

     * `dxPct = (dx / rect.width) * 100`

     * `dyPct = (dy / rect.height) * 100`
  4. Atualizar overlay via `setOverlays(prev => prev.map(...))` somando às coordenadas atuais:

     * `newX = clamp(prevOv.x + dxPct, 0, 100)`

     * `newY = clamp(prevOv.y + dyPct, 0, 100)`
  5. Remover o uso de `info.point` no cálculo.

* Não alterar `dragConstraints`, `dragMomentum` ou estilos.

### BUG 2 — Remover overlay (X) com pointer-events

* Confirmar que o botão já herda `pointer-events-auto` por estar dentro do `motion.div` com `pointer-events-auto`.

* Reforçar a confiabilidade:

  * Adicionar `type=\"button\"` ao botão de remover.

  * Garantir `onClick={(e) => { e.stopPropagation(); removeOverlay(ov.id); }}` permanece.

* Não alterar `pointer-events-none` do container pai (mantém comportamento de bloquear cliques fora dos overlays).

## Validação

* Arrastar qualquer overlay várias vezes: deve mover suavemente sem “saltar” ao soltar.

* Verificar que os limites permanecem (clamp 0–100).

* Clicar no botão “X” remove o overlay sem iniciar drag nem propagar cliques.

## Fora de escopo

* Não alterar `updateOverlayPos` ou adicionar novas ferramentas.

* Não modificar filtros, trim de vídeo, export ou compressão.

## Arquivo impactado

* `src/components/stories/StoryCreatorModal.tsx` (apenas `handleDragEnd` e atributo do botão remover).


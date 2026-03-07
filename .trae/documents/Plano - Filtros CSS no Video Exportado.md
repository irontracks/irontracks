# Plano - Aplicar Filtros CSS no Vídeo Exportado

## Objetivo

Fazer com que os filtros CSS aplicados ao vídeo no editor sejam "queimados" no vídeo exportado, garantindo que o resultado final contenha o filtro visual.

## Arquivos Alvo

* `src/lib/video/VideoCompositor.ts`

* `src/components/stories/StoryCreatorModal.tsx`

## Alterações Planejadas

### 1. VideoCompositor.ts - Adicionar Parâmetro cssFilter

* **Interface RenderOptions**: Adicionar propriedade opcional `cssFilter?: string`

* **Método render()**: Antes de chamar `onDrawFrame(ctx, video)`, se `cssFilter` for uma string não-vazia, aplicar:

  ```ts
  ctx.filter = cssFilter;
  ```

  Após o `onDrawFrame`, restaurar com:

  ```ts
  ctx.filter = 'none';
  ```

### 2. StoryCreatorModal.tsx - Passar Filtro CSS

* **Obter Filtro CSS**: No bloco `if (mediaType === 'video' && fileToUpload.size > MAX_VIDEO_BYTES)`, capturar o filtro atual:

  ```ts
  const previewEl = document.querySelector('#preview-img') as HTMLElement | null;
  const cssFilter = previewEl ? getComputedStyle(previewEl).filter : 'none';
  ```

* **Passar para Render**: Incluir `cssFilter` no objeto de opções do `compositor.render()`

### 3. StoryCreatorModal.tsx - Renderizar Overlays no Vídeo

* **Callback onDrawFrame**: No `onDrawFrame: (ctx, video) => { ... }`, após o `ctx.drawImage()`:

  * Adicionar loop sobre `overlays` (igual ao feito para imagens)

  * Aplicar transformações, estilos de texto e desenhar cada overlay

  * Usar `ctx.save()` e `ctx.restore()` para isolar estilos

## Validação

* Vídeo exportado deve conter o filtro CSS aplicado

* Overlays devem aparecer sobre o vídeo no resultado final

* Nenhuma funcionalidade existente deve ser quebrada


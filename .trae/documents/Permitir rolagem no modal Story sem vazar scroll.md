## Problema (confirmado)
- Hoje o overlay do Story está com `touch-action: none` no container raiz. Isso bloqueia o gesto de scroll no mobile, então você não consegue “arrastar” o modal para ver tudo.

## Objetivo
- Permitir rolagem vertical dentro do modal (sheet), mantendo:
  - scroll do fundo bloqueado,
  - drag/pinch funcionando no preview,
  - sem “vazar” toque para o background.

## Mudanças planejadas (somente no StoryComposer)
### 1) Remover bloqueio global de toque no overlay
- Tirar `touch-none` e `style={{ touchAction: 'none' }}` do overlay raiz.
- Manter `document.body.overflow = 'hidden'` (já existe) para travar o fundo.

### 2) Transformar o sheet em área rolável
- Definir uma altura máxima para o sheet (ex.: `max-h-[calc(100dvh-...)]`).
- Aplicar `overflow-y-auto` e `overscroll-contain` no container do conteúdo do modal.
- Ativar scrolling suave no iOS (`-webkit-overflow-scrolling: touch`) via `style` no container rolável.

### 3) Conter gestos no preview (drag/pinch) sem travar o resto
- Manter `touch-action: none` apenas no preview (`ref={previewRef}`), para drag + pinch continuarem confiáveis.
- Garantir que o preview não capture o scroll do modal quando o usuário tenta rolar fora do preview.

### 4) Validação
- Testar no iPhone:
  - rolagem vertical funciona dentro do modal,
  - fundo não rola,
  - drag/pinch funcionam no preview,
  - botões/ações continuam clicáveis.

## Arquivo afetado
- Apenas: `src/components/StoryComposer.js`

Se você confirmar, eu aplico o patch, valido com build e subo no main.
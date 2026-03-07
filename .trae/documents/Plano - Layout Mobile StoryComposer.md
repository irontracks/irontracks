# Plano - Correção de Layout Mobile do StoryComposer

## Objetivo
Ajustar as classes CSS (Tailwind) do componente `StoryComposer.tsx` para garantir que o layout se adapte corretamente em dispositivos móveis (telas ~390px), eliminando problemas de corte, sobreposição e falta de espaço.

## Arquivo Alvo
`src/components/StoryComposer.tsx`

## Alterações Planejadas (Classes Tailwind)

### 1. Container Principal (motion.div)
- **Remover**: `items-center justify-center sm:p-4`
- **Manter**: `fixed inset-0 z-[2500] bg-black/95 backdrop-blur-md flex flex-col`

### 2. Header Mobile
- **Atualizar padding top**: `pt-14` -> `pt-12`
- **Atualizar alinhamento**: `items-start` -> `items-center`
- **Remover**: `max-w-md mx-auto`
- **Adicionar**: `z-10`

### 3. Inner Container (Card)
- **Adicionar**: `flex-1 min-h-0 sm:mx-auto sm:my-auto` após `w-full`
- **Resultado esperado**: Ocupar todo o espaço vertical disponível no mobile, mas comportar-se como modal centralizado no desktop.

### 4. Layout Grid/Flex Principal
- **Remover**: `h-full` (permite scroll natural)
- **Atualizar alinhamento**: `items-center` -> `items-stretch`
- **Atualizar gap**: `gap-8` -> `gap-4 sm:gap-8`

### 5. Preview Container
- **Reduzir max-width mobile**: `max-w-[300px]` -> `max-w-[220px]`
- **Ajustar max-width desktop**: `sm:max-w-[340px]` -> `sm:max-w-[320px]`
- **Centralizar**: Adicionar `mx-auto`

### 6. Botões de Mídia (Abaixo do Preview)
- **Sincronizar largura com preview**:
  - `max-w-[300px]` -> `max-w-[220px]`
  - `sm:max-w-[340px]` -> `sm:max-w-[320px]`
- **Centralizar**: Adicionar `mx-auto`

### 7. Coluna de Controles
- **Responsividade**: `max-w-[360px]` -> `max-w-full lg:max-w-[360px]`

## Validação
- Verificar se o header não fica cortado.
- Verificar se o preview cabe na tela sem estourar a largura.
- Verificar se os controles são acessíveis via scroll.
- Garantir que o layout desktop permaneça funcional (centralizado).

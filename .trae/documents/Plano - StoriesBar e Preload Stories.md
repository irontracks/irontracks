# Plano — StoriesBar (botão fixo) e Preload adjacente

## Objetivo
Implementar duas melhorias:
1) StoriesBar: adicionar um item fixo no início da lista para o próprio usuário com botão “+” sempre visível.
2) StoryViewer: ajustar o preload de stories adjacentes para baixar 256KB (não apenas 1 byte), melhorando cache inicial.

## Arquivos Alvo
- `src/components/dashboard/StoriesBar.tsx`
- `src/components/stories/StoryViewer.tsx` (linha ~218)

## MELHORIA 1 — Botão de criar story sempre visível

### Estratégia
- Construir um card “Meu Story” fixo no início da barra, independentemente de existir um grupo para `myId`.
- Dados de exibição:
  - Avatar: usar `photoUrl` do grupo do `myId` se existir; caso contrário, mostrar iniciais de “Você”.
  - Nome: “Você” ou `displayName` do grupo, se disponível.
  - Anel: amarelo/dourado para indicar ação de “adicionar” (não depender de `hasUnseen`).
  - Botão “+”: sempre presente e habilitado (exceto quando `uploading`).
- Comportamento de clique:
  - Clique no avatar:
    - Se existir grupo do `myId` com stories, abrir o viewer desse autor.
    - Caso contrário, abrir o creator.
  - Clique no “+”: sempre abre o creator.

### Pontos de integração
- Antes do `.map(ordered)`, renderizar o card fixo “Meu Story” usando os mesmos estilos base dos cards existentes, com ajustes de anel e botão.
- Não alterar o cálculo de `ordered` nem a exibição dos demais grupos.

## MELHORIA 2 — Preload real dos stories adjacentes

### Estratégia
- Em `StoryViewer`, trocar o header `Range` do preload de `bytes=0-0` para `bytes=0-262143` (256KB).
- Manter o uso de `AbortController` e `signal` como está.
- Não alterar outras lógicas de preload ou navegação.

## Validação
- StoriesBar: “Meu Story” aparece no início; “+” visível sempre; avatar abre viewer se houver stories, senão creator; “+” sempre abre creator.
- StoryViewer: confirmar que a requisição de preload utiliza `Range: bytes=0-262143`.

## Fora de escopo
- Carregamento de avatar fora do que já existe em `groups`.
- Mudanças de estilo amplas ou reordenação de grupos além do item fixo.


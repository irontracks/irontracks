## O que são esses 2 erros
- Eles dizem a mesma coisa de duas formas:
  - “In HTML, `<button>` cannot be a descendant of `<button>`”
  - “`<button>` cannot contain a nested `<button>`”
- Isso acontece porque o React/Next detectou que você renderiza um **botão dentro de outro botão**, o que é **HTML inválido** e pode gerar **hydration mismatch** (o HTML do servidor não “bate” com o do cliente).

## Onde está acontecendo
- No [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L1047-L1096):
  - Botão “pai” é o header inteiro do exercício (serve para recolher/expandir).
  - Dentro dele existe outro botão (o do “Vídeo”).

## Correção proposta
### 1) Remover o nesting de botões
- Trocar o botão “pai” (header clicável) de `<button>` para um container não-interativo (`<div>`), e adicionar:
  - `role="button"`
  - `tabIndex={0}`
  - `onKeyDown` para Enter/Espaço
  - manter `onClick` para recolher/expandir
- Manter o botão “Vídeo” como `<button>` com `stopPropagation()` para não disparar o toggle.

### 2) Acessibilidade
- Adicionar `aria-expanded={...}` no container clicável.

## Validação
- Abrir a tela do treino ativo e confirmar que o console não mostra mais esses erros.
- Rodar `npm run build` para garantir que não tem regressão.
## Objetivo
- Quando o usuário rodar “Normalizar exercícios”, mostrar quais treinos foram afetados (e, se possível, quantas alterações em cada um).

## Onde Ajustar
- Ajustar o handler em [IronTracksAppClient 3.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/(app)/dashboard/IronTracksAppClient%203.js) na função `handleNormalizeExercises` (ela já identifica `candidates` e atualiza via `updateWorkout`).

## Mudança de Comportamento
- Durante a varredura, além de `changed = true`, contabilizar quantas trocas de nome aconteceram por treino.
- No loop de atualização, acumular uma lista `updatedWorkouts` com:
  - `title` do treino
  - `changesCount` (quantos exercícios tiveram nome alterado)
- No final, o `alert` vira algo como:
  - “Normalização concluída: 5 treinos atualizados”
  - seguido de uma lista:
    - “• A - PEITO (2 exercícios)”
    - “• B - COSTAS (1 exercício)”
  - Se forem muitos (ex.: >10), mostrar só os 10 primeiros + “(+N outros)”.

## Opcional (Qualidade de Vida)
- Se nenhum treino mudou, manter a mensagem atual.
- Se o treino não tiver título, cair para “Treino (id curto)”.

## Validação
- Rodar lint/build e testar manualmente:
  - ter 2+ treinos com sinônimos
  - executar Ferramentas → Normalizar exercícios
  - confirmar que o alert lista os treinos afetados e as contagens.

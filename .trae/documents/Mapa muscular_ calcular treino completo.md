## Diagnóstico
- O mapa muscular é calculado no endpoint [muscle-map-week/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/muscle-map-week/route.ts) usando o histórico salvo em `workouts.notes`.
- Para cada exercício, ele só soma volume se existir um mapeamento em `exercise_muscle_maps.mapping.contributions`.
- Hoje, um exercício pode continuar “zerado” mesmo com heurística porque pode existir um registro em `exercise_muscle_maps` com **mapping inválido/antigo** (sem `contributions` ou vazio). Nesse caso ele **não entra em missingPairs**, a heurística não é gerada, e o exercício fica em `unknownExercises` e não soma (isso bate com “Abdominal Infra” ficar 0).
- Mesmo quando a série não foi marcada como concluída, o endpoint tem fallback de “sets planejados” — então o que está faltando aqui é principalmente **mapeamento válido** para o exercício de abdômen.

## Objetivo
- Garantir que o treino “A - quadríceps + abs (segunda)” compute todos os exercícios, incluindo **Abdominal Infra (Suspenso ou Solo)**, sem depender de IA.

## Implementação
- **1) Tratar mapping inválido como ausente (fallback seguro)**
  - Ao carregar `exercise_muscle_maps`, validar se `mapping.contributions` existe e tem itens válidos.
  - Se estiver vazio/inválido, considerar como “missing” e gerar heurística (e upsert) para aquele `exercise_key`.
  - Isso garante que o abdômen não fique preso em registros legados quebrados.

- **2) Melhorar heurísticas para cobrir o treino do print**
  - Expandir [exerciseMuscleHeuristics.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/utils/exerciseMuscleHeuristics.ts) com regras simples e conservadoras:
    - “abdominal”, “infra”, “prancha/plank”, “crunch” → `abs`
    - “cadeira extensora” → `quads`
    - “leg press” → `quads` (já existe alias para leg press)
    - “hack”/“agachamento hack” → `quads` (com um pouco de `glutes` opcional)
    - “passada”/“afundo” → `quads` + `glutes`
  - Priorizar precisão (pesos 1.0 ou divisão simples) e marcar `notes` como heuristic.

- **3) Regras de contagem de sets (bodyweight)**
  - Ajustar a regra de “set feito” para bodyweight (se `reps > 0` conta mesmo com `weight` 0/vazio).
  - Garantir que o fallback de estimativa (sets planejados) não seja bloqueado por logs incompletos.

## Validação
- Forçar recálculo clicando em **ATUALIZAR** no card (ele chama `refreshCache: true` em [MuscleMapCard.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/MuscleMapCard.tsx)).
- Confirmar que:
  - `abs` deixa de ficar 0 quando existe “Abdominal Infra (Suspenso ou Solo)” no treino.
  - `unknownExercises` não lista mais esse exercício.
- Rodar `lint` e `build` para garantir segurança.

## Observação (por que pode não refletir na hora)
- O endpoint usa cache em `muscle_weekly_summaries` por até ~6h quando não pede refresh; por isso o botão **ATUALIZAR** é obrigatório após a correção.
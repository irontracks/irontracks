## Diagnóstico (por que alguns exercícios somem)
- O mapa semanal calcula volume por músculo a partir dos treinos da semana, mas **só consegue somar volume se existir um mapeamento** em `exercise_muscle_maps`.
- Hoje, quando falta mapeamento, o exercício entra em `unknownExercises` e **não contribui** para o músculo. E o servidor **só tenta criar mapeamentos via IA quando `refreshAi:true`**.
  - Isso explica casos como “Panturrilha sentada (sóleo)” não aparecer enquanto “Leg Press” aparece.
  - Código: [muscle-map-week/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/muscle-map-week/route.ts#L340-L374) e [muscle-map-week/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/muscle-map-week/route.ts#L427-L435)

## Objetivo
- Garantir que o mapa muscular **reconheça todos os exercícios presentes no treino/histórico**, sem depender do usuário apertar “IA” manualmente.

## Plano de implementação
### 1) Fallback determinístico (sem IA) para exercícios comuns
- Criar uma função de mapeamento por palavras-chave para casos óbvios, ex.:
  - Panturrilha / calf / sóleo / gastrocnêmio / gêmeos → `calves`
  - (podemos incluir outros básicos: peito/supino → chest, tríceps/bíceps, etc.)
- Quando faltar mapping no servidor, aplicar esse fallback e **upsert** em `exercise_muscle_maps` com `source: 'heuristic'`.
- Arquivos:
  - [muscle-map-week/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/muscle-map-week/route.ts)
  - (opcional, para ficar consistente) [exercise-muscle-map/route.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/api/ai/exercise-muscle-map/route.ts)

### 2) Auto-mapeamento de faltantes via IA (sem precisar clicar)
- Desacoplar “IA para mapeamento de exercícios” da “IA para insights semanais”:
  - Mesmo com `refreshAi:false`, se houver exercícios sem mapping e existir `GOOGLE_GENERATIVE_AI_API_KEY`, o endpoint mapeia automaticamente **um lote pequeno** (ex.: até 15–20 por request) e salva no banco.
  - Mantém a geração de insights semanais via IA apenas quando `refreshAi:true`.
- Resultado: “Panturrilha sentada sóleo” passa a ser reconhecida e somar em `calves` automaticamente.

### 3) Canonicalização/aliases para nomes comuns de panturrilha
- Adicionar aliases no [exerciseCanonical.ts](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/utils/exerciseCanonical.ts) para estabilizar chaves:
  - “panturrilha sentada”, “panturrilha sentado”, “sóleo sentado”, “seated calf raise”, etc.
- Isso evita que variações pequenas do nome gerem chaves diferentes e “pareçam exercícios novos”.

### 4) Backfill opcional do histórico (para “pegar tudo” mesmo)
- Adicionar um modo `backfill:true` no endpoint semanal (ou um endpoint separado) que:
  - varre workouts do usuário (últimos 90/180 dias ou tudo, com paginação)
  - extrai todos os `notes.exercises[].name` e garante que todos tenham mapping em `exercise_muscle_maps` (heurística → IA)
- Expor no card um botão “Reprocessar histórico” (para executar quando você quiser).

## Validação
- Criar um teste manual: inserir/usar um treino com “Panturrilha sentada (sóleo)” e confirmar que:
  - some de `unknownExercises`
  - entra como contribuição em `Panturrilhas (calves)`
- Rodar `npm run lint` e `npm run build`.

## O que você quer (interpretação objetiva)
- Para um dia específico, **todo exercício que foi feito naquele dia** precisa entrar no cálculo do mapa muscular.
- Isso inclui exercícios que hoje ficam em `unknownExercises` (sem mapeamento) e exercícios com log incompleto.

## Onde estão os dados “do dia” hoje
- O app salva a sessão finalizada como JSON em `workouts.notes` (exercises + logs). Isso é a fonte de verdade do que foi feito naquele treino.
- O mapa semanal lê `workouts` dentro de um range (semana em UTC) e só calcula músculos quando existe mapeamento exercício→músculo.

## Por que hoje pode faltar exercício no cálculo
1) **Exercício sem mapeamento**: ele entra em `unknownExercises` e fica fora do volume muscular.
2) **IA não é chamada para todos sempre**: por padrão só tenta mapear um lote pequeno (20/60) e só quando `refreshAi`.
3) **Fuso/dia**: o range é calculado em UTC; treinos próximos da meia-noite podem cair no “dia” diferente do seu fuso.

## Plano para garantir 100% dos exercícios do dia
### 1) Calcular por “dia” (não por semana) com range correto
- Criar endpoint dedicado **`POST /api/ai/muscle-map-day`** que recebe:
  - `date` (YYYY-MM-DD do seu dia)
  - `tzOffsetMinutes` (do client) para o servidor calcular início/fim do dia no seu fuso
- O endpoint busca **todos os workouts concluídos** naquele range e extrai `notes.exercises` + `notes.logs`.

### 2) Garantir mapeamento de TODOS exercícios daquele dia
- No endpoint diário, antes de calcular, rodar um “resolve mapping” para todos os exercícios do dia:
  - Heurística primeiro
  - IA depois para TODOS os faltantes (em lotes, repetindo até acabar ou atingir um limite alto configurável)
  - Persistir no `exercise_muscle_maps` para não gastar IA toda hora.
- Resultado esperado: `unknownExercises` tende a ficar vazio (ou quase).

### 3) Contabilização: o que conta como “feito”
- Regra proposta (para bater com “exercícios feitos”):
  - Se houver logs com `done`/peso/reps: conta normalmente.
  - Se não houver logs mas o exercício existe na sessão: conta como **estimativa** baseada em `sets` planejados (igual ao mapa semanal faz hoje) para não “sumir” exercício.

### 4) UI/UX para você validar
- Na UI do mapa muscular:
  - Adicionar seletor de data (“Hoje / Ontem / calendário”)
  - Botão “Reprocessar com IA (dia)”
  - Lista “Exercícios incluídos” + lista “Sem mapeamento” (se sobrar algum)

### 5) Validação e prova de que está pegando tudo
- Pegar um dia real com N exercícios e:
  - Comparar lista de exercícios do endpoint diário com a lista do treino salvo (`notes.exercises`).
  - Garantir que o endpoint devolve N (ou soma entre sessões) e que nenhum exercício ficou de fora por falta de mapping.
- Rodar `lint` + `build`.

Se você aprovar, eu implemento primeiro o endpoint diário + mapeamento total (itens 1 e 2), e só depois adiciono a UI (item 4), porque já resolve a “exatidão” na origem.
## Causa
- As UIs "Novos Recordes" e "Conquistas" dependem de dados vindos de `workout-actions`.
- Após o backup, o módulo foi recriado com stubs que retornam vazio, então os cards não têm conteúdo para exibir.

## O que vou fazer
### 1) Implementar cálculo real no `workout-actions.js`
- Helpers de parsing dos logs (notes JSON dos treinos): somar volume (peso × reps), extrair melhores por exercício.
- `getLatestWorkoutPrs()`
  - Buscar o último treino não-template do usuário.
  - Ler `notes.logs`, calcular melhores (peso máx/reps máx/volume máx) e montar `prs`.
  - Retornar também `workout.title` e `workout.date`.
- `computeWorkoutStreakAndStats()`
  - Buscar últimos ~370 treinos, calcular `currentStreak` por dias consecutivos.
  - Calcular `totalVolumeKg` somando todos os logs concluídos.
  - Montar `badges`: thresholds simples de streak (3/7/14/30/60/100) e volume (10k/25k/50k/100k/250k/500k/1M).

### 2) Garantir robustez
- Parsing tolerante (substitui vírgula por ponto, remove caracteres não numéricos, trata null/strings).
- Funcionamento mesmo com treinos antigos/notes inválidos (vazios retornam `{ ok: true, prs: [], ... }`).

### 3) Versionar o arquivo
- Adicionar `src/actions/workout-actions.js` ao git e subir para o GitHub para não sumir em outros ambientes.

### 4) Validação
- `npm run lint` e `npm run build`.
- Abrir dashboard:
  - Ver "Novos Recordes" quando o último treino for nos últimos 7 dias e tiver logs válidos.
  - Ver "Conquistas" com badges de streak/volume e barra de progresso do Iron Rank com `totalVolumeKg`.

Confirma que posso executar?
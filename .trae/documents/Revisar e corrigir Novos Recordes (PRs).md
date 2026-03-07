## Diagnóstico (como funciona hoje)
- O card “Novos Recordes” é o [RecentAchievements.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/dashboard/RecentAchievements.tsx) e ele busca dados via `getLatestWorkoutPrs()`.
- `getLatestWorkoutPrs()` pega o último treino salvo no histórico e compara com até 30 treinos anteriores: [workout-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L338-L411)
- A extração dos PRs vem de `extractLogsStatsByExercise()`: [workout-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L295-L336)

## Problemas prováveis (o que pode estar “errado”)
1) **PR pode sair “fake”**: hoje o cálculo do card NÃO checa `log.done` (set concluído). Então um set preenchido mas não marcado como feito pode virar recorde: [workout-actions.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/workout-actions.js#L310-L330)
2) **Reps-only não conta**: exige `weight > 0` e `reps > 0`, então barras/flexões/abdominais (ou qualquer exercício sem carga) não aparecem no card.
3) **Inconsistência com PR das notificações**: na API de finalizar treino, o PR para seguidores considera `done` e calcula reps mesmo com peso 0, mas sem normalização de nome (o card normaliza). Isso pode gerar divergências.
4) **Arquivo duplicado**: existe `workout-actions 2.js` (parece cópia) e não achei import direto; risco de drift e confusão futura.

## Plano de correção (baixo risco)
### 1) Alinhar critério de “set válido”
- Ajustar `extractLogsStatsByExercise()` para **considerar apenas sets com `done === true`**.

### 2) Permitir PR de reps sem peso
- Ajustar cálculo para aceitar `reps > 0` mesmo quando `weight` é 0/vazio.
- Manter `volume = weight*reps` (pode ser 0), mas ainda assim destacar PR de `reps`.

### 3) Normalização consistente de exercícios
- Aplicar a mesma `normalizeExerciseKey()` onde necessário para o PR (principalmente onde houver comparação entre treinos e/ou lógica similar na API de finish), mantendo o nome original apenas para exibição.

### 4) Garantir refresh após finalizar treino
- Se o dashboard não remonta, o card não recarrega (ele só faz fetch no mount). Vou garantir um “reload key”/trigger para atualizar “Novos Recordes” quando um treino é finalizado.

### 5) Limpeza/organização
- Confirmar se `src/actions/workout-actions 2.js` está realmente morto. Se estiver, remover para evitar drift.

## Validação
- Criar cenários de teste manuais:
  - set com peso/reps preenchido mas **done=false** não deve gerar PR;
  - reps-only (peso 0) deve gerar PR de reps;
  - variação de nome com acento/maiúsculas entre treinos deve continuar detectando PR;
  - finalizar treino e voltar ao dashboard deve atualizar o card sem refresh.
- Rodar `npm run build`.

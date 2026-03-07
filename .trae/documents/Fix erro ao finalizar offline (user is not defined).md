## Diagnóstico do erro
- O alerta do print mostra: **“Erro ao finalizar: user is not defined”**.
- Isso acontece dentro do `finishWorkout()` em [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js#L300-L498): no bloco que trata offline eu chamei `enqueueWorkoutFinishJob({ userId: user?.id, ... })`, mas **não existe variável `user` nesse escopo** (o user chega via `props.user`).

## Correção (objetiva)
1) Substituir `user?.id` por `props.user?.id` ao enfileirar o job offline.
2) Envolver o `enqueueWorkoutFinishJob(...)` em `try/catch` para evitar que qualquer falha de storage (ex.: quota, private mode) quebre o fluxo.
3) Se `props.user?.id` estiver ausente, mostrar alerta “não autenticado” e impedir finalizar offline.

## Validação
- Rodar `npm run lint`.
- Reproduzir:
  - entrar em um treino
  - simular offline
  - finalizar → deve cair no fluxo “Finalização pendente” sem exception.

## Arquivo a alterar
- [ActiveWorkout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/components/ActiveWorkout.js)
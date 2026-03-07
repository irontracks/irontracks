## Diagnóstico
- O endpoint do mapa muscular ([muscle-map-week/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/muscle-map-week/route.ts)) só considera uma série como feita quando:
  - `log.done === true`, ou
  - `weight > 0` e `reps > 0`.
- Em exercícios de abdômen/bodyweight é comum o usuário preencher apenas `reps` e deixar `weight` vazio/0 e (principal) não clicar em “Concluir”, então `log.done` fica `false`.
- Pior: o código atual contabiliza a série como “logada” só por existir a chave `exIdx-setIdx`, mesmo que `done` seja falso. Isso zera o fallback de estimativa (planned - logged) e o abdômen acaba ficando 0.

## Mudança proposta (segura)
- Ajustar a regra de “série feita” no cálculo do mapa muscular para considerar **bodyweight** como feito quando houver `reps > 0` mesmo com `weight` vazio/0.
- Ajustar o contador de séries logadas para **só contar setIdx quando a série for considerada feita** (ou seja, depois da nova lógica de `done`). Isso reativa o fallback de estimativa para séries planejadas não concluídas.
- Manter o comportamento atual para séries de aquecimento (warmup) e para exercícios sem mapeamento.

## Implementação (arquivos)
- **Editar** [muscle-map-week/route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/muscle-map-week/route.ts):
  - Criar uma função pequena `isSetDone(log)` baseada em:
    - `log.done === true` OU `repsNum > 0` (independente de `weight`, aceitando vazio/0).
  - Mover/condicionar o preenchimento de `loggedSetsByExerciseIdx` para ocorrer **apenas quando `isSetDone` for true**.
  - Garantir que sets “preenchidos” mas não feitos não bloqueiem a estimativa.

## Validação
- Recalcular a semana atual forçando refresh do cache (`refreshCache: true`) pelo botão “Atualizar” do card.
- Conferir que:
  - Abdômen deixa de ficar 0 para treinos com reps preenchidas.
  - `unknownExercises` continua aparecendo só quando realmente não há mapeamento.
- Rodar `lint` e `build` para garantir que a correção é segura.

## Nota sobre cache
- O endpoint cacheia o resultado por algumas horas. Após a correção, a UI precisa pedir `refreshCache` (o botão “Atualizar”) para refletir na hora.

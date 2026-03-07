## Resposta direta
- Não. O **Mapa Muscular não “recebe” o relatório**.
- O “relatório” (period-report) é calculado **no client** a partir de `historyItems` (treinos carregados) e **não é enviado/armazenado** como uma entidade que o mapa consome.
- O Mapa Muscular calcula direto dos treinos (`workouts`) e do JSON dentro de `workouts.notes` (exercícios + logs). Então ele usa a **mesma fonte bruta** do relatório, mas **não usa todas as métricas/infos do relatório**.

## O que o mapa muscular realmente usa (fonte de verdade)
- Endpoint: `/api/ai/muscle-map-week` [route.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/ai/muscle-map-week/route.ts)
- Lê `workouts` da semana (user_id, is_template=false, date range) e usa:
  - `workouts.notes` como JSON da sessão (`session.exercises[]` e `session.logs{ exIdx-setIdx: { weight,reps,done,... } }`).
  - Mapeamento exercício→músculos em `exercise_muscle_maps.mapping`.
- Ele não usa:
  - `buildPeriodStats()` nem o objeto `stats` do relatório.
  - `topExercisesByVolume`, `totalVolumeKg`, etc. (isso existe só no relatório).

## O que o relatório usa (e por que isso não “vai pro mapa”)
- O relatório (semana/mês) é calculado em [HistoryList.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/HistoryList.js) via `buildPeriodStats(days)`.
- Ele também deriva tudo de `workouts.notes` + logs, mas agrega diferente (volume kg, top exercícios, etc.).

## Resposta prática à sua pergunta (“está recebendo tudo?”)
- **Se “tudo” = os treinos/logs necessários**, então: o mapa pega o necessário **desde que** `workouts.notes` esteja completo (exercises + logs) e os exercícios estejam mapeados (ou caiam na heurística/IA).
- **Se “tudo” = todas as informações do relatório (volume kg, top por frequência, etc.)**, então: **não**, porque essas métricas não são input do mapa — são outputs do relatório.

## Plano para conferir 100% (sem achismo)
1) Auditoria de campos: listar exatamente quais campos de `notes/logs` o mapa usa vs o relatório usa.
2) Teste controlado: pegar 1 treino com logs completos e comparar:
   - `totalSets/totalReps/volume` do relatório vs
   - `estimatedSetsUsed/diagnostics` do mapa (ele tem estimativas e pode tratar warmup/sets faltantes diferente).
3) Se você quiser que o mapa “receba” dados do relatório:
   - Definir quais métricas do relatório devem aparecer no mapa.
   - Implementar uma camada comum de agregação (mesma função) para ambos ou exportar `stats` para o endpoint do mapa.

Se você me disser o que você chama de “todas as informações do relatório” (volume? tempo? top exercícios?), eu já planejo a unificação exata (sem quebrar nada).
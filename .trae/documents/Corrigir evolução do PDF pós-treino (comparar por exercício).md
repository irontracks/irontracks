Nenhuma Skill é necessária aqui porque é uma análise/refatoração do fluxo de relatório/PDF já existente no código.

Hoje a “Evolução” do PDF está assim:

* Ela tenta comparar o treino atual com **um único treino anterior** (previousSession) escolhido por:

  * `originWorkoutId/workoutId` OU

  * `workoutTitle/name` (igual) + data anterior

  * Código: [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20\(trae\)/App%20IronTracks/src/components/WorkoutReport.js#L100-L163)

* A coluna “Evolução” no PDF/HTML compara **apenas carga (weight)** e só aparece se `prevLog.weight` for “truthy”.

  * Código: [buildHtml.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20\(trae\)/App%20IronTracks/src/utils/report/buildHtml.js#L78-L161)

Por que pode falhar para a Karol mesmo tendo histórico:

* Se o histórico dela não tem `originWorkoutId` consistente e o título mudou, o `previousSession` pode ficar `null`.

* Mesmo quando acha um treino anterior, a comparação é frágil porque o histórico usa logs por chave `${exIdx}-${setIdx}`; se ordem/estrutura muda, a “evolução” some/erra.

* A regra `if (prevLog && prevLog.weight)` ignora casos onde weight é `0`/string vazia e também não compara por reps.

## Objetivo

Mudar o PDF para comparar a evolução **por exercício**, buscando o **último histórico que contenha aquele exercício**, em vez de depender de um único “treino anterior” global.

## Plano

## 1) Criar resolução de “histórico anterior por exercício”

* No [WorkoutReport.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20\(trae\)/App%20IronTracks/src/components/WorkoutReport.js), adicionar uma função que:

  * Consulta o histórico `workouts` (is\_template=false), parseia `notes`.

  * Para cada exercício do treino atual, encontra o histórico mais recente que tenha o mesmo exercício (normalização de nome: trim/lowercase e remoção de duplos espaços).

  * Extrai `prevLogs` daquele exercício no treino histórico (descobrindo o `exIdx` do exercício naquela sessão e pegando todos logs com prefixo `${exIdx}-`).

  * Resultado: `prevLogsByExercise = { [exerciseNameNormalized]: prevLogsArray }`.

## 2) Refatorar o builder do PDF/HTML para aceitar `prevLogsByExercise`

* Alterar assinatura de `buildReportHTML` em [buildHtml.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20\(trae\)/App%20IronTracks/src/utils/report/buildHtml.js) para aceitar um 5º parâmetro opcional `options`, ex.: `{ prevLogsByExercise, compareMode }`.

* Se `prevLogsByExercise` existir, ele substitui o `prevLogsMap` atual.

## 3) Melhorar cálculo de evolução (não só carga)

* Atualizar `hasProgressionForExercise` e `rowsHtml` para:

  * Considerar evolução por **carga** quando ambos os lados são numéricos.

  * Se não houver carga válida, comparar **reps**.

  * Opcional: quando ambos existirem, usar **volume (weight\*reps)** como critério.

* Corrigir as checagens “truthy” (`prevLog.weight`) para checagens numéricas robustas.

## 4) Transparência no PDF

* Mostrar no bloco de cada exercício algo como “Comparado com: DD/MM/AA” (data do último histórico daquele exercício), quando existir.

  * Isso evita a sensação de “não calculou” sem explicar por quê.

## 5) Validação

* Reproduzir com:

  * Um treino com exercícios reordenados (deve continuar comparando).

  * Um treino sem `originWorkoutId` (deve comparar por exercício).

  * Caso Karol: com histórico existente, ao menos alguns exercícios devem mostrar evolução.

* Rodar `npm run build`.

Se aprovado, eu implemento exatamente esses ajustes nos arquivos:

* `src/components/WorkoutReport.js`

* `src/utils/report/buildHtml.js`


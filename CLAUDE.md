# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# IronTracks — Instruções para Claude Code

## O que é este projeto
Plataforma fitness social em produção com usuários reais. App web (Next.js/Vercel) + apps nativos iOS e Android (Capacitor). Sistema VIP com pagamentos reais (RevenueCat/Apple IAP). **Mudanças aqui afetam usuários em produção — cuidado redobrado com breaking changes.**

## Stack
- **Web**: Next.js 16 + React 19 + TypeScript 5.9 strict + Tailwind CSS v4
- **Mobile**: Capacitor 8 (iOS + Android) — hybrid app
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **IA**: Google Gemini (`@google/generative-ai`) + Vercel AI SDK
- **Pagamentos/IAP**: RevenueCat (`@revenuecat/purchases-capacitor`) + Apple IAP
- **Monitoramento**: Sentry (client + server + edge) + Vercel Analytics
- **Testes**: Vitest (unit) + Playwright (E2E)
- **Deploy**: Vercel via git push — `npm run deploy` faz typecheck + commit + push automático

## Estrutura de pastas essencial
```
src/
  app/          # Next.js App Router (rotas e páginas)
  actions/      # Server Actions do Next.js
  components/   # Componentes React (19 subpastas por domínio)
  contexts/     # React Contexts (auth, dados globais)
  hooks/        # Custom hooks (59 hooks)
  lib/          # Lógica de negócio (offline, push, social, video)
  schemas/      # Schemas Zod (validação)
  types/        # Tipos TypeScript globais
  utils/        # Utilitários por domínio (ai, auth, calculations, vip, etc.)
supabase/
  migrations/   # 23 migrations PostgreSQL (usar MCP para novas)
e2e/            # Testes Playwright (16 specs)
ios/            # Projeto Xcode (Capacitor)
android/        # Projeto Android Studio (Capacitor)
scripts/        # Scripts de build e utilitários
```

## Arquitetura de alto nível (exige ler vários arquivos)

**Carregamento remoto (crítico p/ decidir o que precisa de build):** o app nativo carrega o front do **servidor remoto** (`capacitor.config.*` → `server.url` = `https://irontracks.com.br`), NÃO dos assets embutidos. Logo: mudanças de **web/JS/servidor entram em produção pra todos os apps já instalados via deploy web (Vercel)**; **só mudanças nativas (Swift/plugin em `ios/`) exigem nova build no TestFlight**. Classifique toda tarefa por esse eixo.

**Treino ativo** (`src/components/ActiveWorkout.tsx`): estado em `useActiveWorkoutController` (retorna `{ value, logs }`). O `value` (estável) vai no `WorkoutProvider`; os `logs` (mudam a cada tecla) num `WorkoutLogsProvider` separado (`components/workout/WorkoutContext.tsx`) — por performance. **`ExerciseCard` consome os DOIS**; renderizar fora de um deles lança erro (foi um crash real no overlay do parceiro). Logs = mapa com chave `"exIdx-setIdx"`. **Nada some do header do treino ativo** (`WorkoutHeader.tsx`): até 22/08/2026 o
bloco de ações — Editar treino, menu "…" (Organizar/Cardio GPS/**Convidar**) e o
X de descartar — ficava `opacity-0 pointer-events-none` enquanto durasse
`ui.activeExecution`, estado que nasce ao iniciar a série pelo timer de descanso
e só morre quando AQUELA série é concluída. Quem iniciava e não concluía perdia
os três pelo resto da sessão, inclusive a única saída sem gravar. Guard:
`components/workout/__tests__/headerBotoesSempreAlcancaveis.test.tsx`.

CRUD/organizar/editor-completo em `components/workout/hooks/useWorkoutExerciseCrud.ts`; editar mid-sessão remapeia os logs por índice (`helpers/reconcileEditedExercises.ts`).

**Auditoria de ponta a ponta 28/08/2026 — sete correções.** O relatório
completo e o que ficou varrido-e-sólido estão nos PRs; o que precisa sobreviver
ao `/clear`:

⚠️ **A semana começava na SEGUNDA em CINCO lugares** (`reportMetrics`,
`useMuscleTrends`, `periodization`, `streakRisk`, `workoutNotifications`) — todos
com a MESMA aritmética `(weekdayIndex + 6) % 7`, e nenhum pego pelo guard, que
mirava em três outras formas. Hoje os cinco usam `weekRangeBrt` e o guard cobre
a quarta forma. **A lição que fica: guard de FORMA não substitui teste de
COMPORTAMENTO** — provado por mutação duas vezes na mesma sessão (trocar a
função por "data − 1 dia" deixava o guard de forma verde). Daí
`semanaDoRelatorio.test.ts` e `semanaDaTendencia.test.ts`, que testam a
fronteira de verdade.

**`countsAsWorkout` agora vale onde o usuário LÊ.** O piso (2 séries, ou 1 com
15 min) existia só no cron do resumo semanal e no mapa muscular; o histórico
contava LINHAS, então uma sessão de 44 s aparecia como treino e o app mostrava
um número diferente do push. `countsAsWorkoutFromSummary` decide pelo resumo da
linha magra (`done_sets` entrou no `slimHistoryRow` — decisão consciente
registrada na allowlist do guard de payload). **A MÉDIA usa o mesmo conjunto do
contador**: dividir o tempo de todas as linhas pelos treinos válidos inflava o
número.

**"Vou descansar" tem volta.** O card era informativo puro e prendia quem tocou
por engano até a virada do dia — sem o atalho de treinar e com a meta rebaixada
(−442 kcal medidos). A capacidade já existia (`setRestDayIntent` faz upsert e
dispara o evento que o card escuta); faltava o botão.

**Exclusão na tela pergunta antes** (`exclusaoPerguntaAntes.test.ts`). O 🗑 da
academia apagava num toque, levando o QR de check-in junto. O guard varre só
`src/components/**` de propósito: é onde o dedo dispara; em hook/lib o
`.delete()` é a mecânica.

⚠️ **O hook `sim:close` (Stop) encerra o app entre os turnos do agente.** Numa
auditoria de tela isso PARECE crash: o app some sozinho. Custou uma
investigação de crash report para descobrir que a causa era o próprio
ferramental. Ao percorrer telas, relance o app a cada turno.

**Segunda rodada da mesma auditoria — quatro achados, 28/08/2026.** As duas
primeiras são CLASSES que este arquivo já descreve e que continuavam vivas em
lugares novos; procure por elas antes de supor que a varredura fechou.

⚠️ **A cota diária VIP contava o dia UTC** (`utils/vip/limits.ts`, quatro
pontos) — ou seja, virava às **21h de Brasília**. Quem usava a IA às 21h30
consumia a cota de amanhã e quem estourava às 20h50 esperava dez minutos por
uma cota nova. Medido em produção: 12 de 186 usos (6,5%) na janela, e é Gemini
PAGO. O efeito grave era silencioso: o REEMBOLSO usa a mesma conta de dia, então
consumo às 20h59 gravava o dia X e o reembolso às 21h01 procurava X+1 — não
achava a linha e a cota **não voltava** para quem não recebeu resposta. O reset
SEMANAL do mesmo arquivo já era BRT (`weekReset.ts`); era só o dia que estava
fora de linha. Hoje `brtDateKey()`, guard em `vip/__tests__/cotaDiariaBrt.test.ts`.
Mesma classe do heatmap de nutrição e do streak: **dia UTC em app brasileiro é
sempre suspeito**.

⚠️ **Mídia e GIF do chat gravavam sem olhar o `{ error }`** — e disparavam o
push antes. Como **o supabase-js não lança em erro de escrita**, a mensagem não
gravava, ninguém via erro, e o destinatário recebia notificação de uma mensagem
que não existe: abria o chat e não havia nada. O envio de TEXTO, no MESMO
arquivo, sempre checou `insertError` e ainda oferece "Reenviar" — era lapso, não
desenho, e é o padrão a copiar. Guard de FORMA em
`chatMidiaNaoFalhaEmSilencio.test.ts` (montar o `ChatDirectScreen` mediria o
harness): ele exige a DESTRUTURAÇÃO daquela chamada. A primeira versão aceitava
qualquer "error" na vizinhança — inclusive o `logError` do bloco ao lado — e
passou verde com a mutação. É o jeito nº 8 da lista de guards falsos.

**O IMC gravado no banco divergia do exibido.** `calculateBMI` clampa; o
`useAssessment` gravava `weight / altura²` cru. Duas telas do mesmo laudo, dois
números. Fonte única em `bmiForStorage`. E **o teto subiu de 60 para 80**: 60
apaga obesidade grau III, que é pessoa real — o clamp existe para o erro de
digitação (altura em metros no campo de centímetros dá IMC 261), não para negar
o caso extremo verdadeiro.

**O check-in escrevia ponto e ensinava vírgula.** O campo de peso vinha com
`String(94.6)` → "94.6", o texto embaixo dizia "94,6 kg" e o placeholder,
"Ex: 85,0" — três formatos do mesmo número na mesma tela. É só exibição: salvar
segue normalizando vírgula → ponto (`Number("95,5")` é `NaN` e o peso sumiria do
cálculo calórico).

**A tira de navegação do treino ativo (28/08/2026).** Treino de 10 exercícios só
tinha rolagem — nenhum índice, nenhum salto. `WorkoutExerciseRail` é irmã do
header (FORA do contêiner que rola), some sozinha abaixo de
`MINIMO_PARA_MOSTRAR_TIRA` exercícios, e o toque chama o MESMO `focusExercise`
do "fazer depois".

Ela não guarda estado: cor e progresso saem de `lib/workout/exerciseRail.ts`
sobre logs + adiados. **`atual` é independente do estado** (dá para estar num
card concluído), então a COR diz o estado e o ANEL diz onde você está —
colapsar os dois num campo faria a tira mentir sobre um deles. E concluído
vence guardado, o mesmo critério do aviso de finalizar; se divergirem, a tira
cobra um exercício que o diálogo já não cobra.

Alvo de 44px REAIS (`h-11 min-w-11`), não `.tap-44`: numa fileira horizontal a
área estendida do `::after` invadiria o card de baixo e roubaria o toque da
primeira série — é o mesmo problema dos dots do tour, por outro caminho.

**Renderers de série — 14 irmãos, mas 12 agora desenham pelo MESMO molde** (`components/workout/set-renderers/`): `ExerciseCard.renderSet` roteia cada série pro renderer do método (normal, drop, rest-pause, cluster, grupo/Bi-Set, stripping, FST-7, ponto zero, forçadas, negativas, parciais, sistema 21, onda, cardio/plank). Até 20/08/2026 cada um reimplementava peso/reps/RPE/concluir por conta própria — daí os bugs: em jul/2026 o Bi-Set exigia reps pra concluir (a normal não exige) e travava o botão sem explicar, e o drop escondia o peso das etapas porque o `truncate` colapsava o texto inline. **Hoje os 11 métodos que abrem MODAL (drop, rest-pause, cluster, stripping, FST-7, heavy duty, ponto zero, forçadas, negativas, parciais, sistema 21, onda) usam `AdvancedSetRow.tsx`** — a linha vira UM componente, com a MESMA grade da série normal (`32px nº · 36px notas · 1fr campos · 92px Concluir`); no lugar de peso/reps/RPE inline, a faixa de 1fr é o botão "Abrir" que preenche tudo (pedido do dono, 19–20/08/2026). Rest-Pause e Cluster, que têm peso inline, passam ele por `weightSlot` — divide a faixa com o "Abrir". `normalSet` (a referência, campos inline) e `groupMethodSet` (Bi-Set/Super-Set/Tri-Set/Giant-Set, sem modal) ficam de fora por desenho. Guard de CLASSE em `set-renderers/__tests__/moldeUnicoAvancado.test.ts`: método novo que desenhe a própria linha reprova; a lista de exceção também reprova quem já migrou (não vira papel de parede). **Mexeu em comportamento de série avançada, mexa no molde — não em 11 arquivos.** Cardio/plank e `normalSet`/`groupMethodSet` continuam por conta própria; se algo parecer divergência entre eles, aí sim varra manualmente.

**Motor de carga automática (autoload)** — `utils/autoload/`: `suggestWeight.ts` (núcleo puro: e1RM Epley ajustado por RPE → inverte pro alvo; trava anti-regressão, teto de +10%/sessão, prontidão só amortece), `plateMath.ts` (arredonda pro incremento montável, pra baixo), `equipmentFromName.ts` (infere equipamento pelo nome pt-BR). Fiação em `hooks/useWorkoutAutoload.ts` (reusa o `reportHistory` do `useWorkoutDeload` + check-in de hoje). Gate: `settings.autoLoadBeta && settings.autoLoad`. `useAutoloadWeight.ts` é o hook que os renderers avançados usam. **`weightSource: 'user'` no log = o usuário assumiu aquela série; o motor NUNCA reescreve depois disso.**

**Escrever peso sem dizer a FONTE trava o campo (22/08/2026).** O dono relatou
"não deixa trocar o peso" num Bi-Set: digitava e o valor voltava para a
sugestão. Não era o motor — era a marca. Enquanto o log disser
`weightSource: 'auto'`, o efeito do `useAutoloadWeight` RE-SINCRONIZA o campo
com a sugestão, e isso é proposital (o histórico chega do cache primeiro e da
rede depois; sem isso o número congela desatualizado). Quem manda o motor parar
é `'user'`. O `normalSet` marcava ao digitar e os savers de modal marcam na
fronteira (`useWorkoutMethodSavers`) — faltavam os TRÊS renderers cujo peso é
campo **inline**: `groupMethodSet` (Bi-Set, Super-Set, Tri-Set, Giant-Set,
pré/pós-exaustão), `clusterSet` e `restPauseSet`. Os outros 11 editam por modal
e já estavam certos. Hoje a marca sai de `setUserWeight()`, exposto pelo próprio
`useAutoloadWeight` — fronteira única, não 14 cópias. Guard de classe em
`set-renderers/__tests__/pesoEditavelComAutoload.test.tsx`: varre os 14 e reprova
`updateLog` com `weight` sem `weightSource` (dispensa só patch de conclusão, em
que o efeito nem roda). **Teste que só confere o patch do `updateLog` passa
verde com o bug vivo** — o caso precisa do ciclo (digita → grava →
re-renderiza → efeito roda), e como os renderers são `React.memo` sobre um
contexto mockado estável, o harness remonta por `key`.

**O motor aprende os pesos que a MÁQUINA tem** (`machineGrid.ts`). `plateMath` assume máquina de 5 em 5 kg — falso em boa parte dos aparelhos: a "Mesa flexora" desta base registra 18, 23, 27, 32, 36, 41… (stack em LIBRAS, 10 lb = 4,54 kg), e o motor pedia 20/25/30/35/40, valores que não existem ali. Agora os pesos JÁ REGISTRADOS são a verdade sobre o que é montável (`collectKnownWeights` varre TODAS as sessões, sem filtrar deload/treino — um peso registrado prova que o furo do pino existe). Snap só desce ou iguala; acima do topo extrapola pelo passo aprendido; **desiste (volta ao plateMath) quando o alvo cai num buraco do histórico** — snapar 45 para 30 seria regressão inventada por falta de dado.

**Falha muscular (`log.failure`) alimenta o motor, não é só enfeite.** `suggestWeight` não progride a carga quando a última sessão foi à falha (`anyFailed`). O caminho é longo e já esteve QUEBRADO no meio: log → `useWorkoutDeload` monta `setFailures` no `ReportHistoryItem` → `buildHistorySets` repassa `failed` → motor. Até jul/2026 os dois últimos elos não existiam, então a trava nunca disparava e a carga subia após séries que estouraram. Exibição: `ReportExerciseCard` (marca + contagem) **e** `buildHtml.ts` (PDF) — os dois. **A flag é SEMPRE marcação manual do usuário** — Heavy Duty e Repetições Forçadas vão à falha por definição e deliberadamente NÃO a gravam: se gravassem, a carga congelaria no `topWeight` para sempre e o aluno nunca progrediria nesses métodos (decisão do dono, jul/2026; guard em `set-renderers/__tests__/failureIsManualOnly.test.ts`). Não confundir com `reps_failure`, que é a CONTAGEM de reps até falhar, coletada no modal desses dois.

**`useInputField` (`set-renderers/normalSet.tsx`) — zona de corrida.** Cada input de série tem estado LOCAL porque o ticker de 1s re-renderiza tudo e um input controlado perderia tecla. O efeito de sincronização com o valor externo já jogou fora valor digitado duas vezes: a guarda anti-descarte precisa considerar a **digitação** (`typedAtRef`), não só o blur — com `blurredAtRef` ainda 0, `Date.now() - 0` é gigante e a guarda não pega. Sintoma no device: "digito o RPE e some", só em campos unilaterais (o re-sync do autoload dispara um `updateLog` extra logo após a tecla).

**Bug intermitente que não reproduz: instrumente, não chute.** Padrão `logWarnRemote` (`lib/logger.ts`) = warning pesquisável no Sentry (≠ `logError`, que é exception). Foi assim que o "RPE some" saiu de fantasma pra corrigido em 24 h — o payload entregou a causa. Toda saída silenciosa em caminho crítico é bomba-relógio.

**Bi-Set / Super-Set / Tri-Set…** — `lib/workoutGroups.ts` (`buildExerciseGroups`) infere grupos por exercícios CONSECUTIVOS de mesmo método (sem schema novo). `ExerciseList` auto-alterna entre os membros ao concluir uma série; o descanso só pode rolar no **último membro do par** (o enunciado do método é "0s descanso entre eles"). **O run consecutivo é fatiado pelo TAMANHO do método** (`GROUP_METHOD_SIZE`: Bi-Set/Super-Set/Pré-/Pós-exaustão = 2, Tri-Set = 3; Giant-Set sem tamanho fixo) — sem isso, 4 Bi-Sets seguidos (= dois pares, caso real do treino de braço) viravam um grupo de 4 e o 2º exercício nunca descansava. Guards: `src/lib/__tests__/workoutGroups.test.ts` e `set-renderers/__tests__/groupMethodRest.test.tsx`.

**Sessões ficam em `workouts.notes`** (JSON serializado como TEXT), NÃO numa tabela de sessões. `workout_session_logs` está praticamente vazia em produção — **não confie nela**. Finalização: `useWorkoutFinish` → `buildFinishWorkoutPayload` (`src/lib/finishWorkoutPayload.ts`) → `POST /api/workouts/finish` (idempotente via `finish_idempotency_key` + lock Upstash). No finish, `buildReportMetrics` (`utils/report/reportMetrics.ts`) computa e grava `reportMeta` dentro do notes.

**Orçamento de payload das rotas quentes (histórico + bootstrap).** Como a sessão inteira mora em `workouts.notes`, qualquer rota que selecione essa coluna e repasse a linha crua serve centenas de KB sem parecer errada. O histórico já engordou assim uma vez (corrigido em ago/2026 por `utils/history/slimHistoryRow.ts` — a rota resume no servidor e o JSON completo é buscado sob demanda). Guards de CI: `utils/history/__tests__/historyPayloadBudget.test.ts` (teto de 450 B por linha de treino, allowlist de chaves, source-guard do `select`) e `app/api/dashboard/__tests__/bootstrapPayloadShape.test.ts` (allowlist de workout/exercise/set nos DOIS caminhos — RPC e fallback TS —, teto por template e source-guard das chaves do `jsonb_build_object` na migration mais recente da RPC). Fixtures realistas em `src/__tests__/fixtures/hotRoutePayloads.ts`. **Campo novo nessas rotas = teste vermelho de propósito**: é o pedido de revisão, não um falso positivo — atualizar a allowlist é uma decisão consciente. Dívida conhecida travada por ratchet: usuário SEM template cai no 2º branch do bootstrap (rota e RPC), que devolve "qualquer workout do user" — inclusive sessões concluídas com o `notes` inteiro.

**Salvar arquivo no iPhone tem UM caminho: `utils/report/exportHtmlAsPdf.ts`.**
`window.print()` **não existe no WKWebView** — quem o chama direto entrega um
botão inerte no aparelho, e em silêncio. O helper tenta, nesta ordem: PDF nativo
(`sharePdfFromHtml`, abre o share sheet do iOS) → Web Share com arquivo →
Filesystem → nova aba + print (desktop). Como no iOS ele já abre o share sheet,
**"baixar" e "compartilhar" são o MESMO gesto**: um botão só, e o destino
(Arquivos, WhatsApp) é escolhido lá. Compartilhar TEXTO solto vira `.txt` no
share sheet — nunca é a resposta para "quero o relatório".

⚠️ **O guard desse helper já falhou uma vez por ser da INSTÂNCIA.** O PR de
jul/2026 travou os três chamadores daquele dia numa lista, e o **relatório
semanal/mensal do histórico nasceu depois** com `window.open` + `print()` — o
botão "Baixar PDF" ficou inerte no iPhone até 22/08/2026, com um `catch {}`
vazio engolindo a falha. Hoje há um caso de CLASSE em
`exportHtmlAsPdf.guard.test.ts`: quem chama `print()` precisa desviar o nativo
antes. A checagem é pela **CHAMADA, não pelo nome** — com o nome solto, um
arquivo que só IMPORTA o helper e segue imprimindo à mão passa verde (medido ao
repor o bug).

**Relatório de PERÍODO (semanal/mensal) ≠ relatório de sessão.** Modal em
`HistoryListPeriodReportModal`, hook em `history/hooks/useHistoryPeriodReport.ts`,
HTML em `utils/report/buildPeriodReportHtml.ts`. O arquivo exportado tem duas
metades: os **agregados** (`stats`) e o **detalhe treino a treino**
(`utils/report/periodSessionDetails.ts` — série a série, pela fonte única do
`setVolume.ts`). O detalhe fica **fora de `stats` de propósito**: `stats` inteiro
vai ao prompt da IA de insights, e o mês de séries custaria dinheiro sem melhorar
o insight. Guard de FIAÇÃO em `periodReportExport.test.tsx` — ele anda pelo hook
e lê o HTML que chegou ao exportador, porque `buildPeriodSessionDetails` e
`buildPeriodReportHtml` passam verdes isoladamente com o botão morto.

**Dia de "registro incompleto" (`nutrition_day_flags`, 24/08/2026) — a marca é
do USUÁRIO, o app só sugere.** Um dia em que a pessoa lançou só o café entrava
inteiro na média. Medido na conta do dono, 68 dias: dias com 3+ refeições somam
**2.544 kcal**, os de 1 refeição, **970** — a média exibida era 2.199 contra
2.544 dos dias bem registrados, ~14% de erro num número que vai para o
nutricionista. Marcar é INSERT, desmarcar é DELETE (a tabela não tem UPDATE);
`summarizeHistory` recebe o conjunto e tira os dias da média **e do
denominador**, devolvendo `excludedDays` para a tela DIZER que excluiu.

⚠️ **Não transforme isso em automático.** Em fase de CUT um dia de 1.200 kcal
pode ser o plano; excluí-lo sozinho apagaria dado verdadeiro e empurraria a
média para CIMA — erro na direção oposta, e invisível.

**A heurística de sugestão (`lib/nutrition/incompleteDay.ts`) exige as DUAS
condições, e cada uma sozinha erra num caso REAL da base** (auditados antes de
o critério virar código): `08/07` tem **1 refeição e 3.482 kcal** (ele lançou o
dia inteiro de uma vez — o corte por contagem excluiria o maior dia da série) e
`21/03` tem **5 refeições e 1.026 kcal** (registrou tudo e comeu pouco). A régua
é a **mediana** do próprio usuário, nunca a média: com média, aquele dia de
3.482 levanta o limiar e mascara os dias fracos ao redor. Abaixo de 10 dias
registrados o app fica calado.

**Ao mexer nos testes desta área:** o mock do Supabase precisa distinguir a
TABELA. `nutrition_day_flags` tem a mesma cadeia `select→eq→gte→lte` de
`nutrition_meal_entries`, então um mock que ignora o nome devolve as refeições
como se fossem marcas — e todos os dias somem da média. Derrubou 8 testes na
primeira execução.

**Relatório de NUTRIÇÃO por período — o que vai para o nutricionista
(24/08/2026).** Tela em `dashboard/nutrition/NutritionHistoryModal`, período em
`lib/nutrition/historyPeriod.ts` (fonte única), HTML em
`utils/report/buildNutritionPeriodHtml.ts`. Janelas de 7/15/30/90 dias **e
intervalo escolhido pelo usuário** — o pedido concreto era "os 3 últimos meses".
Sai por `exportHtmlAsPdf`, como todo arquivo do app.

**Desde 25/08/2026 ele também lista as REFEIÇÕES, dia a dia** (nome, hora BRT,
alimentos, kcal e macros) — antes o profissional lia "5 refeições" e não via
quais. Teto de 31 dias, e acima disso o relatório diz que omitiu. Ver a seção
"Histórico de REFEIÇÕES".

**Dia sem lançamento NÃO entra como zero**, e a cobertura ("7 de 92 dias") vai
impressa. Preencher os vazios rebaixaria a média com refeições que a pessoa só
não anotou — um número inventado com cara de medição, entregue a um
profissional. É a mesma regra do `summarizeHistory`, agora também no papel.

Duas armadilhas medidas ao construir, as duas fora do alcance de teste unitário:

1. **`periodo` é objeto DERIVADO e entra nas dependências do efeito de busca.**
   Sem `useMemo`, cada `setResultado` cria identidade nova, o efeito dispara de
   novo e o modal metralha o Supabase enquanto estiver aberto. **O ESLint não
   acusa** — a dependência está declarada corretamente. Enquanto era o número
   `janela`, a estabilidade vinha de graça. Guard: `uma janela = uma consulta`.
2. **Conferência visual pegou o que 6.450 testes não pegariam:** o título já era
   o intervalo e a linha de baixo o repetia; e "Escolha as duas datas." acendia
   em VERMELHO com os campos ainda vazios — campo em branco não é erro, e
   vermelho aqui é erro/estouro de meta, nada mais.

**Calorias:** modelo MET em `utils/calories/metEstimate.ts` (`estimateCaloriesMet`) + wrapper `estimateSessionKcal` (lê o JSON de `workouts.notes`). Por exercício = rateio do total via `utils/calories/distributeKcal.ts`. Relatório React usa `reportMetrics`; o **PDF/compartilhamento é um gerador HTML separado** em `utils/report/buildHtml.ts` (`buildReportHTML`/`buildReportData`) — mexeu num, cheque o outro.

**Os INGREDIENTES da kcal têm fonte única: `utils/calories/sessionKcalInputs.ts`**
(corrigido em 12/08/2026). O modelo MET sempre foi um só — o que divergia eram os
ARGUMENTOS: o relatório passava peso do check-in **e RPE**, a nutrição passava só
o peso do perfil, e o `reportMetrics` passava `{}`. Na mesma sessão do dono:
**744 kcal no relatório × 698 na aba Nutrição**, e 744 ÷ 698 = **1,066** — o
multiplicador de RPE do modelo, medido, não estimado.

`sessionKcalInputs(session, profile, checkins?)` resolve UMA vez:
**peso** = check-in da tabela > check-in embutido na sessão > perfil > default ·
**sexo** = perfil > sessão · **RPE** = pós-treino (tabela > embutido). O
`SessionKcalInputs` é **branded**: objeto literal não compila, então chamador
novo não reinventa a ordem. Os 7 chamadores consomem dele; `buildReportMetrics`
e `useHistoryActions` ganharam o parâmetro `profile`, e a rota `workouts/finish`
lê o perfil pelo `userSnapshot`. O PDF recebe os ingredientes **prontos** da tela
(`opts.kcalInputs`) — não pode discordar do card que o usuário acabou de ver.

**Duas coisas que a nota anterior errava, para ninguém repetir a conta:** (1) o
`{}` do `reportMetrics` **não caía sempre em 78 kg** — `estimateSessionKcal` já
tinha fallback para o `preCheckin` da sessão, então nas 105 sessões com peso no
check-in o peso saía certo e só o RPE faltava; nas **491 de 596** sem esse
campo, aí sim o rateio por exercício usava 78 kg contra o peso real do card e as
parcelas não somavam o total. (2) O RPE está **dentro do JSON da sessão**
(`postCheckin.rpe`, conferido no banco), e é por isso que a nutrição alcança o
número do relatório sem ir buscar check-in nenhum.

Guards em `utils/calories/__tests__/sessionKcalInputs.test.ts`: precedências,
fiação (as três superfícies no mesmo número) e source-guard que reprova objeto
literal como 2º argumento — o parser anda caractere a caractere porque
`[^;]*?` atravessa a chamada inteira em arquivo sem ponto-e-vírgula e acusa o
`{` de outra linha. Provados por mutação (literal na nutrição, RPE amputado,
precedência invertida → vermelho nos três).

**Dívida conhecida, pequena:** o `reportMeta.exercises[].caloriesKcal` **gravado**
nas sessões antigas ficou com o rateio velho. A tela do relatório não usa esse
campo (redistribui o total exibido), mas o **story de treino** usa — sessão
antiga compartilhada mostra o rateio antigo até ser regravada. Não vale migração
de 596 linhas.

**Nutrição:** DUAS superfícies distintas — a página `/dashboard/nutrition` (`NutritionMixer`) e o `NutritionOverlay` (a aba NUTRIÇÃO do dashboard). Ambas derivam a meta de `nutrition_goals` (salvo) ou do TDEE do perfil (`user_settings.preferences`) — hoje pelo **`userSnapshot`** (ver abaixo), não cada uma por conta. Ao mexer em meta/nutrição, ajuste as DUAS. **O overlay renderiza o MESMO `NutritionMixer`** — ou seja, todo card da página existe também no app nativo; a exceção continua sendo a navegação até a página, que só a web tem.

**Cor de macronutriente tem fonte única: `lib/nutrition/macroColors.ts`** (âmbar/azul/laranja + `MACRO_SURFACES` para blocos). Nasceu porque a mesma decisão estava escrita TRÊS vezes, diferente em cada lugar, e duas conviviam na mesma tela: o carboidrato era azul no card Macronutrientes e amarelo no de Lançamentos, e a gordura usava `#ef4444` — a cor de ERRO do app —, então 23 g de gordura pintavam um bloco inteiro de vermelho. **Vermelho é só estouro de meta** (`MACRO_OVER_COLOR`). Guard em `__tests__/nutritionEntryCard.test.tsx` reprova hex de macro dentro de componente.
**Os 18,7° entre proteína e gordura — RESOLVIDO em 12/08/2026, e não trocando cor.** Proteína (`#fbbf24`, 43°) e gordura (`#f97316`, 25°) seguem abaixo dos 40° que a paleta exige de si mesma, e vão continuar: não há faixa de matiz livre (vermelho é ERRO, verde é sucesso, azul é carboidrato, violeta virou a cor da máquina). Mas a distância de matiz nunca foi o problema — **dois matizes próximos convivem enquanto não se TOCAM**. Os dois pontos onde encostavam: (1) no card de lançamento os segmentos são condicionais (`pct > 0`), então refeição sem carboidrato cola âmbar em laranja — o azul que "salvava" era acaso; (2) no `MacroBar` o vermelho de estouro era desenhado encostado no macro, e contra a gordura são **25°** — o alerta sussurrava justamente onde precisa gritar. `MACRO_SEGMENT_GAP_PX` (2px do fundo entre blocos) resolve os dois sem gastar matiz. Guards em `__tests__/macroBar.test.tsx`.

**Mapa muscular: o gênero troca a BASE e a MÁSCARA, NUNCA os overlays (26/08/2026).**
Três superfícies desenham o corpo — a tela (`components/muscle-map/BodyMapSvg.tsx`),
o PDF (`utils/report/buildMuscleMapHtml.ts` + `fetchMuscleMapAssets.ts`) e o
manequim do Story (`lib/muscleMap/mannequinCanvas.ts`) —, as três com a MESMA
composição e a MESMA tabela (`lib/muscleMap/overlays.ts`): foto do manequim,
camada de overlays por músculo, e uma máscara da silhueta por cima para nada
vazar do corpo. **Quem recorta QUAL músculo acende é o canal ALFA do PNG do
overlay**; a máscara só impede vazamento para fora, ela não distingue peito de
coxa.

Existiu uma `public/muscle-overlays-female/`. Ela **nunca chegou a ser usada em
produção**: nasceu no commit `5b39b1043` (13/03/2026) e foi tirada do render 19
minutos depois pelo `eb55b1b03`, que trocou as bases femininas por versões
alinhadas ao enquadramento do manequim masculino e passou a reusar
`/muscle-overlays/` para os dois gêneros. Isso está CERTO e é fácil de conferir:
o `front-chest.png` de lá é um torso com seios — a arte já é anatomicamente
feminina. **Conferido na tela em 26/08/2026**, com o gerador real e o gênero
feminino: peito, ombro, bíceps, abdômen, quadríceps, dorsal, tríceps, lombar,
glúteo e posteriores acendem alinhados ao corpo feminino, sem artefato que o
masculino não tenha.

**A pasta órfã ficou 5 meses no repo e enganou quem passou depois** (esta nota
existe por causa disso). Medida antes de ser apagada, ela era inaproveitável por
três motivos independentes, e nenhum deles se resolve no código: (1) **100%
opaca** — sem alfa, cada overlay pintaria a silhueta inteira; (2) **outro
manequim**, em enquadramento próprio por arquivo (largura do corpo de 233 a 596
px contra 287 da base) — o melhor registro por escala + translação dá **IoU
0,35–0,66**, contra 0,89 das duas bases entre si, então nem alinhar por
transformação resolve; (3) faltava `front-forearms.png` (14 de 15). Reexportar
com alfa e aceitar as duas formas de PNG foram os dois caminhos avaliados e
**descartados pela medição** — o que faltaria é renderizar a arte do MESMO
manequim feminino que gerou `body-front-female.png`, o que é trabalho de arte 3D
e depende de asset-source que não está no repo. Recuperável em
`git show 3bf9ba378:public/muscle-overlays-female/<arquivo>`.

Guard em `src/__tests__/muscleOverlayAlphaRecortado.test.ts` (provado por
mutação, três casos): PNG sem alfa na pasta reprova, overlay citado no código sem
PNG reprova, e pasta paralela `muscle-overlays-*` reprova.

✅ **O antebraço que acendia as MÃOS — CORRIGIDO em 28/08/2026**, e não foi
preciso reexportar arte nenhuma (esta nota dizia que seria).

O defeito era geométrico: os dois antebraços da arte ocupavam x=[77,206] e
[432,562] numa tela de 640, **fora do corpo** (a silhueta vai de 178 a 462).
Como a composição recorta pela máscara, sobrava só a interseção — que calha de
ser a região das mãos. Medido: **2,3%** da tinta caía dentro da silhueta, e o
arquivo tinha 66.132 px opacos, MAIS que o corpo inteiro (62.884). A arte em si
sempre esteve certa: são antebraços anatômicos, desde o commit que a criou.

A correção veio da geometria que o projeto já tinha: **a forma do antebraço é a
própria silhueta do manequim entre o cotovelo e o punho**, e a arte entra como
TEXTURA. `scripts/gerar-overlay-antebraco.mjs` regenera o PNG a partir da fonte
preservada em `scripts/assets/` — reprodutível, e com `--check` para medir o
arquivo atual sem escrever nada.

O cotovelo (y=252) e o punho (y=314) saíram da largura do braço linha a linha:
37px na articulação, afunilando até 22px no punho e alargando de novo para 33px
quando começa a mão. A forma sai da INTERSEÇÃO das silhuetas masculina e
feminina (que diferem por 1–3 px ali), então serve os dois gêneros — que é como
esta pasta funciona.

⚠️ **O guard que faltava, e é ele que importa:**
`src/__tests__/muscleOverlayDentroDoCorpo.test.ts` mede quanto da tinta de cada
overlay cai DENTRO da silhueta. O teste de alfa que já existia passava verde com
o bug vivo — o arquivo tinha alfa, tinha recorte, só estava no lugar errado.
Limiares medidos nos 15 overlays reais, não escolhidos no chute: o pior
legítimo é `back-delts_rear` no feminino, com 63,5%; o piso é 50%. Provado por
mutação repondo o PNG defeituoso. Conferido na tela do app (simulador, conta de
teste): antebraços acesos do cotovelo ao punho, mãos apagadas.

**Heatmap Treino × Nutrição:** o bucketing por dia vive em `lib/nutrition/correlationDays.ts` (função pura, dia sempre BRT). Antes a rota fazia `toISOString().slice(0,10)` — dia UTC —, então **todo treino depois das 21h BRT acendia o quadrado do dia seguinte** e o próprio "hoje" da grade virava amanhã. A rota não devolve mais `workout_calories`: era o literal `300` por sessão exibido como se fosse medição.

**`MyDietPlan` — o posicionamento automático não pode vencer o usuário.** "Abre no dia de HOJE" roda no efeito que observa `days`, e os botões de dia já estão na tela nesse instante: quem tocasse num dia antes de o efeito rodar era devolvido para hoje em silêncio, e o swap ia para o índice errado. `positionedRef.current = true` é marcado no efeito **e no clique**. Guard varre os sete dias da semana.

**"Já treinou hoje?" tem fonte única: `lib/workout/trainedToday.ts`**

**O card de treino piscava a cada abertura (24/08/2026).** Relato: "toda vez que
entro no app, o card TREINO DE HOJE aparece por cerca de 1 segundo e some". Não
era render — o cache do positivo vivia só em MEMÓRIA e morria com o app, então
toda abertura recomeçava sem saber e ia à rede; nesse intervalo o consumidor
trata "não sei" como "ainda não treinou". **Essa leitura do desconhecido está
CERTA e não deve ser invertida**: esconder a ação primária durante a consulta
deixaria a primeira dobra vazia para quem de fato não treinou, e o card entraria
depois empurrando a tela — o mesmo flash, ao contrário.

Hoje o positivo é persistido em `localStorage` com o DIA na chave (vira sozinho
na meia-noite BRT), e a consulta segue rodando em segundo plano para DESFAZER a
marca se o servidor discordar — o caso real é apagar do histórico a sessão de
hoje, que sem isso esconderia o botão de iniciar até a virada do dia. Só o
positivo é gravado: "não treinou" envelhece em minutos.

Os guards medem **quantas idas à rede acontecem antes de a resposta existir**,
não o booleano — o valor final sempre esteve correto, o defeito era o tempo até
chegar nele, e um teste do valor passaria verde com o flash vivo. — usada pelo `QuickStartCard` (o atalho "Treinar agora" some depois da sessão concluída) e pelo `RestDayPromptCard`. Dia BRT, `is_template = false`, e **nunca** selecionar `workouts.notes` para responder um booleano.

**`userSnapshot` (`lib/user/snapshot.ts`) — o LEITOR único dos dados do usuário. Comece por ele antes de escrever qualquer `from('user_settings')`.** Devolve os fatos já resolvidos (antropometria declarada, objetivo, fase da dieta, stats de TDEE, meta do dia + de onde ela veio) por setor: `profile`, `nutrition`. Nasceu porque as mesmas 5 chaves de perfil eram extraídas em DOIS lugares independentes (`extractProfileStats` e o `profileSection` do `userContext`) e a fiação "meta salva > TDEE do perfil" existia em TRÊS (página, overlay, contexto de IA) — o tipo de duplicação que não quebra nada hoje e diverge em silêncio no dia em que o perfil ganhar um campo.

**Não é depósito: não existe tabela `user_snapshot`,** nada é sincronizado, nada é gravado. O que é derivado na leitura não fica velho — uma tabela espelho seria uma segunda fonte de verdade, exatamente o padrão que já custou caro aqui. Quatro regras (documentadas no cabeçalho do módulo): modular por setor · derivado nunca persistido · **jamais selecionar `workouts.notes`** (a sessão inteira mora lá; seria o engorda-payload que o `slimHistoryRow` desfez, em escala maior) · degrada por setor **sem engolir o sinal** (daí `savedGoalsError`, que alimenta o aviso de schema ausente da página). As duas leituras internas saem em PARALELO — o leitor único não pode custar round-trip a quem o adota, e há guard que fica vermelho se alguém serializar.

**O snapshot entrega FATOS; quem exibe aplica POLÍTICA.** O piso `DEFAULT_GOALS` e o rótulo da origem (`saved`/`profile`/`default`) vivem em `lib/nutrition/displayGoals.ts` (`resolveDisplayGoals`) — eram a última coisa escrita duas vezes, com a constante copiada em cada superfície.

**Ratchet:** `lib/user/__tests__/userSettingsReadRatchet.test.ts` congela a lista de quem ainda lê `user_settings` direto (20 arquivos), agrupada por MOTIVO. Ela só encolhe: **arquivo novo lendo direto reprova, e entrada que já migrou também reprova até sair da lista** — sem a segunda metade a allowlist vira papel de parede e o débito fica congelado com cara de resolvido. O administrativo (LGPD, painel de professor/admin) lê a linha inteira de propósito e provavelmente fica fora do snapshot para sempre. Mapa completo de quem lê o quê: **`docs/USER_DATA_MAP.md`** — leia antes de investigar de novo onde mora um dado do usuário.

**Plano alimentar salvo + troca de alimento (ago/2026).** A dieta gerada era efêmera; agora salva em `student_diet_plans` — a MESMA tabela do plano prescrito pelo professor, separadas por `created_by`: `= user_id` é plano próprio (editável), `≠` é do coach (read-only). A rota `prescribed-plan` filtra por `.neq('created_by', userId)`; sem isso a dieta que o usuário gerou aparece como recomendação do coach, num card que trava a edição. Leitura SEMPRE por `planDays()` (`lib/nutrition/dietPlanShape`), que normaliza plano de um dia (`meals`) e de semana (`days`) numa lista só — e recomputa os totais dos itens, nunca lê total gravado.

**O motor de troca de alimento não usa IA — e o repertório "aprendido" É LIXO.** `nutrition_learned_foods` guarda o que o usuário DIGITOU no lançamento, e ele digita refeição inteira: dos 42 "alimentos" da conta do dono, **1** servia de substituto (37 compostos, 14 com densidade fisicamente impossível — 1070/1285/1650 kcal/100 g, que é o TOTAL da refeição gravado no campo `per_100g` —, 17 com a quantidade no nome). **A fonte certa é `nutrition_meal_entries.items`**, que o parser já quebrou em alimentos individuais com gramas e macros absolutos (`{"label": "150g arroz", "grams": 150, …}`) — e **desde 25/08/2026 a estimativa por IA também separa** (antes ela somava tudo num item só; ver "Histórico de REFEIÇÕES") — daí sai nome limpo e macros/100 g derivados de gramas reais (`lib/nutrition/mealItemFoods`). Todo candidato passa por `foodItemSanity` (sem composto, sem densidade impossível, sem quantidade no nome).

**Classificar alimento por macro dominante SOZINHO produz sugestão absurda.** Auditoria de 132 trocas reais (04/08/2026) pegou: bife virando ovo (gordura dominava), leite desnatado virando substituto de mamão e feijão (caía em fruta/verdura), maionese virando bolo, arroz virando "orange chicken". As cinco regras que consertaram, todas em `foodSwap`: (1) proteína ≥ 10 g/100 g e ≥ 25% das kcal manda, mesmo com gordura maior; (2) `produce` exige proteína < 35% das kcal — o corte fica ENTRE leite desnatado (39%) e alface/brócolis (26–29%), e apertar demais joga alface em `carb`; (3) `mixed` NÃO troca (sem saber o papel, é chute); (4) dentro de `fat`, candidato com > 25% das kcal em carbo sai (separa requeijão de brigadeiro); (5) porção que encosta no clamp (10 g/1000 g) é recusada. Além disso, a adequação à refeição vem do HISTÓRICO (`mealContext`: em que refeições ele já comeu aquele alimento), não de lista fixa — e alimento sem histórico não é bloqueado, só não ganha preferência. **Ao mexer aqui, audite contra dados reais e LEIA as sugestões: os filtros mecânicos diziam "0 problemas" enquanto o motor sugeria trocas que ninguém faria.**

**O gerador de cardápio tinha o MESMO defeito de fonte — e ninguém percebeu porque o consertado foi o outro caminho.** O motor de TROCA migrou para `nutrition_meal_entries.items` em 03/08; o de GERAÇÃO (`food-profile.ts` → prompt do `dietGenerate`) ficou lendo o cru até 04/08/2026. Duas fontes erradas: (1) `nutrition_meal_entries.food_name` é o nome da REFEIÇÃO, então o prompt mandava "os alimentos que este usuário já come: Almoço (36×), Pós treino (21×), Janta (19×), Café da manhã (18×)…" — 13 dos 20 eram rótulo; (2) `nutrition_learned_foods` sem crivo. O modelo improvisava em cima disso e o dono recebeu um "Plano Cardioprotetor" com **whey 30 g e aveia 40 g secos** no café da manhã e pão francês no almoço. Hoje o repertório sai dos ITENS, passa pelo mesmo `foodItemSanity` da troca e vai ao prompt **agrupado por refeição** (`foodProfileToPromptSections`: "- Almoço: arroz, feijão, patinho") — é o agrupamento, não uma lista fixa, que impede pão com doce de leite de cair no almoço. **Ao tocar em qualquer coisa que alimente prompt de nutrição, cheque as DUAS pontas: o que a troca lê e o que a geração lê.**

**Bater o macro não é entregar comida — `lib/nutrition/mealCoherence.ts`.** Guard determinístico sobre o cardápio gerado, em duas classes: veículo faltando (pó sem líquido) é objetivo e **repara** (acrescenta Água 0 kcal para whey/creatina, Leite desnatado para aveia/sucrilhos); incoerência de composição (dois doces na mesma refeição, doce dominando as kcal) só REPORTA, e o motor devolve o problema ao modelo numa única retentativa. Nunca ampute o prato num reparo mecânico: remover comida derruba o plano abaixo da meta. Armadilha do módulo: `/leite/` casa com "doce de leite" e "leite condensado" — sem `NOT_A_LIQUID` o guard declara que o café da manhã do caso real já tinha líquido, ou seja, passa verde exatamente na refeição que existe para pegar. Fiação provada em `__tests__/dietGenerateCoherence.test.ts` (Gemini mockado devolvendo o cardápio real reprovado).

**A variação da SEMANA desfazia a coerência do dia-base — conserte os dois motores, sempre.** Testado no simulador em 04/08/2026 sobre um plano recém-gerado: o dia base saiu "Leite desnatado · Whey · Sucrilhos · Pão" e a terça, derivada pelo motor de troca, virou "**ovo mexido** · Whey · Sucrilhos · Pão". Causa: leite desnatado tem 36% das kcal em proteína, então `classifyFood` o põe em `protein` — mesma classe do ovo mexido. Pelo macro a troca é impecável; na prática devolve o prato seco. Três correções: (1) `isVehicleLoadBearing` tira do sorteio o item que sustenta o veículo; (2) `liquidKindOf` distingue líquido **cremoso** de **fino** — água satisfaz whey e NÃO satisfaz sucrilhos/aveia (o guard antigo só perguntava "tem líquido?" e deixou passar "sucrilhos + Água"); (3) `isCondiment`/`isPreparedPlate` no `foodItemSanity` — maionese entrou no lugar do abacate (ambos `fat`) e "pedaços de pizza de alcatra acebolada" no lugar do patinho (ambos `protein`). O `buildWeekFromDay` ainda repara cada dia derivado, porque a troca pode INTRODUZIR um pó onde não havia. **Guard só vale com macro real: com `protein: 9, fat: 1` no leite a troca nem acontece e o teste passa verde com o bug reposto** — a fixture usa os números que estavam no banco.

**Classe de macro certa ≠ papel no prato certo (`isRoleCompatible`).** Depois de consertado o líquido, o mesmo plano ainda trouxe "pão francês 100 g → **doce de leite tirol 105 g**" no café de sábado e "patinho moído 200 g → **whey growth 95 g**" no jantar de quinta. As duas trocas são impecáveis pelo macro (carbo por carbo, proteína por proteína) e ninguém executa nenhuma. Duas regras estreitas, aplicadas dentro do `swapFood` (vale para a semana E para o botão de trocar): doce concentrado só substitui doce concentrado; suplemento em pó não substitui comida de prato em refeição principal (pó por pó segue valendo). **Ao mexer no motor de troca, leia as sugestões contra um plano real** — os filtros mecânicos ficam verdes enquanto o cardápio fica impossível.

**O horário das refeições sai do histórico, não de palpite (`lib/nutrition/trainingSchedule.ts`).** O gerador marcava "Pós-Treino 18:30" para quem treina às 6 da manhã, e o app tinha a resposta gravada em DOIS lugares: `workouts.completed_at` (12 sessões seguidas terminando 07:34–08:29) e a hora em que ele lança o "Pós treino" (09:04, 09:19, 10:04). **O jejum também é derivado, não declarado**: em 11 dos 12 dias de treino não houve refeição antes do treino terminar. `deriveTrainingSchedule` devolve mediana de término, início estimado, período e `fasted`; `trainingScheduleToPrompt` vira o bloco ROTINA DE TREINO; `findTrainingWindowIssues` reprova pós-treino fora da janela e pré-treino para quem treina em jejum. Sem `MIN_SESSIONS` sessões devolve `null` e o prompt fica em silêncio — horário inventado com cara de fato é pior que horário nenhum. **Duas armadilhas, as duas provadas por mutação:** (1) `completed_at` é UTC e o usuário treina em São Paulo — comparar hora crua erra por 3 h e joga o café na madrugada; (2) o jejum tem que casar refeição e treino **pelo dia-calendário** — no pool global, um único café às 5h21 (24/07, o único dia em que ele comeu antes) marca as 12 sessões como "comeu antes" e inverte o resultado.

**Fase da dieta ≠ objetivo de treino.** `preferences.nutritionPhase` (CUT/MAINTAIN/BULK) é a INTENÇÃO nutricional, escolhida no painel ⚙ Metas; `fitnessGoal` é o objetivo de TREINO. Eram colapsados num só: quem marcava "hipertrofia" recebia BULK (+10% kcal) para sempre, sem ter pedido superávit. Fonte única em `lib/nutrition/phase.ts` (`resolveNutritionPhase` — fase explícita > fitnessGoal, para não mudar a meta de quem já usa o app). `mapFitnessGoal`/`mapGender`/`mapActivityLevel` vivem SÓ lá: já estiveram duplicados entre página e overlay e divergiram (source-guard trava a re-duplicação).

## ⚠️ Editor de Story — três elementos, três espaços, e uma armadilha de canvas

**A MARCA É UMA PALAVRA: IRONTRACKS (25/08/2026).** Cada template trazia um
`brandDivider` (' · ', ' / ', ' 🇧🇷 ') e a marca saía "IRON · TRACKS". Pior: os
layouts `live`, `group` e `workout` desenhavam por OUTRO caminho, sem divisor —
**trocar de layout trocava a grafia do nome**. Cor, fonte, peso e itálico variam
por template; a grafia, nunca. O campo foi REMOVIDO (não zerado) junto com o
`brandDot`. Guard de classe em `__tests__/marcaUmaPalavraSo.test.ts`, que mira
na FORMA da chamada (`fillText('TRACKS', x + ironW, …)`), não no nome do campo —
separador reposto com outro nome também reprova.

**O HORÁRIO é independente do layout desde 25/08/2026, e arrastável.** Ele
estava inline no fim de UM caminho de render, então `workout`/`live`/`group`
retornavam antes e simplesmente não tinham horário. Hoje é `drawTimePill` +
`timeOffset`, com o mesmo contrato da marca (`TimeDragHandle`, imune ao zoom/pan
do bloco). **Os layouts caíram de 7 para 4** no mesmo pedido do dono: LIVE virou
duplicata dos outros com posições soltas, `group` usava a mesma engine e
`top-row` competia com `bottom-row`. Layout antigo em memória cai no fallback de
`renderStoryFrame` — por isso esse fallback não pode sumir.

⚠️ **Campo novo no desenho tem que entrar TAMBÉM no `renderComposite`**, que lê
tudo por ref. O `brandScale` já foi esquecido lá (03/08/2026) e a escala
aparecia na prévia e SUMIA no arquivo salvo. Hoje `exportLeTudoPorRef.test.ts`
COMPARA as duas chamadas em vez de listar campos — o próximo esquecido reprova
sozinho.

`StoryComposer`/`NutritionStoryComposer`/`CardioStoryComposer` compartilham `useStoryComposer` + os mesmos sub-componentes. **Mexeu num, confira os três** — o padrão aqui é componente único (`BrandDragHandle`, `AlignmentGuides`, `CustomTextDragHandle`, `CustomTextPanel`) justamente para não replicar 3× e divergir.

Três elementos independentes sobre a foto/vídeo: a **marca** (IRONTRACKS), a **legenda** do usuário (`customText.ts`) e o **bloco** (título + cards, movido por `workoutTransform`).

**A armadilha que custou um bug (03/08/2026):** `enterBrandSpace` desfaz o transform do bloco porque a MARCA é desenhada DENTRO dele. A LEGENDA não é — os renderers a desenham depois do `ctx.restore()` que encerra aquele transform. Copiar a inversa para ela deslocava o texto pelo NEGATIVO do pan do bloco: com o bloco arrastado, a legenda sumia da tela **enquanto a alça (HTML) continuava no lugar certo**. Sintoma: traçado visível, texto invisível.

**Caixa de elemento = TINTA, não em-box.** `measureBrandBox`/`measureCustomTextBox` usam `actualBoundingBoxAscent/Descent` e devolvem `dx`/`dy` (âncora → canto do traçado). Com `textBaseline='top'` o ponto de desenho é o topo da em-box e as maiúsculas começam abaixo — ancorar ali deixa um vão visível. **A alça e o hit-test do gesto usam o MESMO retângulo**; divergir faz o usuário mirar num lugar e acertar outro.

**Alças em % do CANVAS, nunca px de tela.** `marginLeft: '-6px'` somado a `width` em % do canvas valia 14,4px de canvas numa preview de ~300px — e mudava com o tamanho do preview.

**O EXPORT lê tudo por REF** (`renderComposite`). Já esqueceu `brandScale` uma vez: a escala da marca aparecia na prévia e SUMIA no arquivo salvo. Campo novo no desenho = adicionar ali também, senão só a prévia mostra.

**Ciclo de import:** `customText.ts` REPETE `CANVAS_W/H`/`SAFE_SIDE` de propósito — `storyComposerUtils` importa o desenho de lá, e importar de volta faria as constantes (lidas no topo) chegarem `undefined`, virando NaN na âncora e sumindo a legenda SEM erro. Guard trava a igualdade.

**Gestos:** o gesto pertence a quem ele NASCE em cima (`isPointOverBrand`) — sem isso a pinça no logo escalava o story inteiro, porque o 2º dedo cai fora da caixa pequena da marca e o overlay assumia. Guias de alinhamento (`snapBrandToCenter`) grudam no centro; no BLOCO o alvo é o offset ZERO (ele não tem caixa estável — cada layout desenha em coordenadas próprias) e só o eixo X acende linha, porque a altura de repouso dele não é o meio da tela.

**Treino em dupla (TeamworkV2) — ESTÁ NO AR de novo desde 18/08/2026.**
Linha do tempo, porque esta seção já esteve errada DUAS vezes e custou
investigação nas duas: aposentado no **PR #428** (`96300aad`, 14/07/2026, −4.690
linhas), tabelas dropadas em 15/07 — e **restaurado no PR #859** (`24524529`,
18/08/2026), com as migrations `20260818090000_restore_teamwork_v2.sql` e
`20260818093000_teamwork_rpc_revoke_public_grant_authenticated.sql`. **Conferido
no banco em 22/08/2026**: `invites`, `team_sessions`, `team_session_presence` e
`team_chat_messages` existem. O que NÃO voltou foi o sistema de feature-flags
(`utils/featureFlags.ts`, removido no #436) — a feature entra ligada para todos.

**O ponto de entrada é o menu "…" do treino ativo** (`WorkoutHeader.tsx`): item
com ícone `UserPlus` → `InviteManager` → `/api/team/invite-candidates` +
`contexts/team/useTeamInvites`. Quem procurar "o botão de treino em equipe" está
procurando por ele.

⚠️ **Se ele sumir da tela, suspeite do HEADER antes de suspeitar da feature.**
Em 22/08/2026 o dono reportou "perdemos os botões de cima" e nada tinha sido
removido: o bloco inteiro de ações do header ficava `opacity-0
pointer-events-none` durante a "execução de série", e esse estado
(`ui.activeExecution`) só era limpo ao concluir aquela série específica. Quem
iniciava a série e não a concluía perdia Convidar, Descartar e Editar treino pelo
resto da sessão. Corrigido: nada mais some do header. Guard em
`components/workout/__tests__/headerBotoesSempreAlcancaveis.test.tsx`.

Desenho: contexto compondo hooks de invites/session/presence/broadcast;
participantes gravados como `{uid,name,photo}` e lidos como
`{user_id,display_name,photo_url}` (daí o `normalizeParticipant`); sync por
**broadcast efêmero** do Supabase (sem replay — perde evento se o parceiro fica
em background); máximo de 5 participantes com o host incluso. E a armadilha que
fechou o PR #506 continua valendo: marcar o canal como `private: true` sem as
policies de `realtime.messages` derruba o sync em vez de protegê-lo.

**"Conversas" — lista de CONVERSAS, não catálogo (28/08/2026).** A tela listava
até 200 perfis de `profiles_public` por `last_seen`: nomes, sem prévia, sem
horário, sem não-lidas. Quem tinha três conversas não sabia qual tinha mensagem
nova.

**Não precisou de schema novo** — `direct_channels.last_message_at` e
`direct_messages.is_read/sender_id/content` já existiam; faltava alguém LER.
Duas consultas (canais + amostra das mensagens recentes deles), agrupadas por
`lib/social/conversationList.ts`. O N+1 óbvio (uma busca de "última mensagem"
por canal) faria a tela abrir devagar justamente para quem mais usa o chat.

Três decisões que a implementação ingênua erra: **não lida é só o que EU
recebi** (`is_read=false` E `sender_id≠eu`) — contar as minhas encheria de badge
quem mandou mensagem e não foi respondido; **canal fora da amostra não some**,
aparece sem prévia, porque perder a prévia é aceitável e perder a conversa não;
e **quem está em Conversas sai do catálogo**, senão o mesmo nome aparece duas
vezes.

⚠️ **O horário é BRT explícito** (`formatarQuandoDaConversa`). Sem `timeZone`, a
mensagem das 22h de ontem aparece como sendo de hoje — o mesmo defeito que já
pegou o heatmap de nutrição e o streak aqui.

**Dashboard shell:** `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx` é o client component central; navega por estado `view` ('dashboard'|'active'|'edit'|'assessments'|'community'|'vip'). Boot: `/api/dashboard/bootstrap` (RPC `get_dashboard_bootstrap`) + `useBootstrap` + `useWorkoutFetch`. **Toda hidratação da lista de treinos (SSR inicial, bootstrap, refetch) deve ordenar por `sortWorkoutsByOrder`** (`utils/mapWorkoutRow.ts`) — senão a lista pisca desordenada.

**Contexto do coach (`utils/ai/userContext.ts`) — as 12 rotas de IA bebem daqui.** O setor `profile` lia SÓ de `vip_profile`, tabela do fluxo VIP com 3 linhas para 57 contas: o bloco `[PERFIL E OBJETIVO]` chegava VAZIO para ~95% dos usuários, e o coach respondia sem saber objetivo, nível nem antropometria. Agora lê também `user_settings.preferences` (objetivo de treino, fase da dieta, nível, antropometria rotulada como "declarado" para não competir com a AVALIAÇÃO medida). Sem `nutrition_goals` salvo, a meta é derivada do TDEE e rotulada — antes o coach ficava sem meta nenhuma e podia contradizer o número na tela do usuário. **Hoje este arquivo só FORMATA o prompt:** perfil e meta chegam prontos do `userSnapshot` (uma leitura por chamada, setores sob demanda). Campo novo do perfil entra no snapshot, não aqui — e um guard reprova se ele voltar a ler `user_settings`/`nutrition_goals` direto.

**Avaliação por Foto — poses contraídas não valem para tudo (ago/2026).** São seis
poses: três RELAXADAS (`front`/`side`/`back`) e três CONTRAÍDAS opcionais
(`*_flex`). A separação existe porque contração **aumenta a definição aparente**:
usar as contraídas na estimativa de gordura faria o laudo subestimar o BF. Regra,
escrita no prompt de `api/ai/body-composition-photo`: `bodyFatRange`/somatotipo/fase
e também postura e proporções saem das RELAXADAS; `muscleGroups[].development` e
simetria preferem as CONTRAÍDAS. O gatilho é o rótulo que a rota escreve antes de
cada imagem (`FOTO ... (RELAXADA|CONTRAÍDA)`) — mexer nele desliga a regra sem erro
nenhum. A série histórica também é das relaxadas: pose contraída varia com o quanto
a pessoa contraiu no dia e produziria "evolução" que é só esforço de pose. Catálogo
único em `types/bodyPhotoAssessment.ts` (labels + instruções com os nomes de posing
de palco, que o modelo conhece); guards em `utils/bodyPhoto/__tests__/flexedPoses.test.ts`.

**Saída de IA: structured output + "normalize, depois valide".** Pedir JSON só no TEXTO do prompt e validar com Zod `.max()` NÃO funciona — medido em jul/2026 na Avaliação por Foto: 8 de 12 chamadas ao `gemini-2.5-flash` reprovavam no `safeParse` (JSON com `}` faltando; strings acima do teto, ex. `action` de 343 num limite de 300) e o usuário via "Não consegui gerar a correlação". Padrão correto, implementado em `utils/bodyPhoto/aiContract.ts`: (1) `responseMimeType: 'application/json'` + `responseSchema` na CHAMADA (derruba o JSON inválido a zero); (2) normalizador que TRUNCA (`utils/ai/coerce.ts`) — structured output não garante `maxLength`; (3) só então o schema estrito, como juiz. `utils/ai/extractJson.ts` ainda REPARA JSON quebrado (fonte única, beneficia todas as rotas). Os limites moram num só lugar (`LAUDO_LIMITS`/`CORRELATION_LIMITS` em `types/bodyPhotoAssessment.ts`) e alimentam Zod + responseSchema + normalizador. **Esta linha dizia que "as outras rotas de `api/ai/` ainda usam o padrão antigo" e estava OBSOLETA** (conferido em 09/08/2026): o débito foi zerado nos lotes 1–4 em 02/08 e hoje TODA rota que exige JSON passa o contrato na chamada. Quem guarda isso é `app/api/ai/__tests__/structuredOutputRatchet.test.ts`, com a lista de débito vazia — rota nova sem contrato reprova ali. Mais um caso da regra "nota que descreve o que NÃO temos é a que apodrece primeiro": a linha antiga sobreviveu uma semana à própria correção e fez um agente propor trabalho já feito.

**Feature flags: NÃO EXISTEM MAIS.** `utils/featureFlags.ts` e `FEATURE_KEYS`
foram removidos no PR #436, junto com a aposentadoria do TeamworkV2 — conferido
em 18/08/2026 (`grep -rn "FEATURE_KEYS" src` não devolve nada). Esta linha
descrevia o sistema como se ele existisse e custou uma busca. **Feature nova não
tem onde se esconder atrás de flag**: ou entra ligada para todos, ou o gating é
explícito na UI (um botão que o usuário aciona), ou lê `user_settings.preferences`
por conta própria.

**VIP/pagamentos:** o status VIP NÃO é uma flag persistida — é **derivado em tempo de leitura** por `getVipPlanLimits` (`utils/vip/limits.ts`), em 3 camadas: `profiles.role` (admin/teacher → elite) → `user_entitlements` (fonte de verdade, expira sozinho por `valid_until`) → `app_subscriptions` (fallback legado, filtra `current_period_end`). **Toda escrita de status passa por service-role** (webhook RevenueCat, `revenuecat/sync`, checkout usam `createAdminClient`); o client autenticado só tem SELECT — nunca reintroduzir policy/GRANT de INSERT/UPDATE nessas tabelas pro usuário (foi a brecha de self-grant corrigida em 2026-07-11, migration `lock_down_vip_self_grant_and_usage`). Cotas de IA são contabilizadas SÓ pelos RPCs `SECURITY DEFINER` `increment/decrement_vip_usage_daily` — `vip_usage_daily` também é read-only pro client. Webhook autentica em tempo constante (`safeEqual`) e reconfirma o entitlement na API do RevenueCat antes de conceder.

## Gotchas específicos deste repo
- **Git worktrees NÃO têm `node_modules`.** Pro ESLint num worktree, aponte pro binário do repo principal: `node --import tsx "<repo-principal>/node_modules/eslint/bin/eslint.js" --config eslint.config.mjs <arquivos> --max-warnings 0`. Pra build iOS num worktree, rode `npm ci` NO worktree antes — **NÃO** faça symlink pro `node_modules` do main (conflito de versão no grafo SPM do iOS).
- **Supabase project id:** `enbueukmvgodngydkpzm` (via MCP `mcp__supabase__*`).
- **Chave Gemini: conta PAGA, e é a MESMA de produção.** Corrigido pelo dono em 01/08/2026 — esta nota dizia "free tier, 20 req/dia" e isso está **obsoleto**. Não há mais o teto diário que derrubou a Avaliação por Foto em 31/07/2026, então medição empírica contra a API não trava as features dos usuários. O que continua valendo: a chave é compartilhada com produção e **cada chamada custa dinheiro** — o cuidado agora é com CUSTO, não com cota. (Esta linha dizia que o protocolo de exames usava `gemini-pro`, modelo CARO — **errado, e conferido em 24/08/2026**: `gemini-pro` só aparece num comentário; o protocolo lê `env.gemini.modelId` como todo o resto. E `gemini-pro` está desligado desde 2025 — ver "Qual modelo Gemini o app usa", abaixo.) Diagnóstico de IA em produção: runtime logs da Vercel (MCP `get_runtime_logs`). O gap "Sentry não recebe erro de rota server" foi CORRIGIDO em 02/08/2026 — causa: `captureException` só enfileira e a Vercel congela a instância antes do envio; `lib/logger.ts` agora agenda `Sentry.flush` via `waitUntil` (guard em `loggerServerFlush.test.ts`). Se o Sentry voltar a ficar mudo para rotas server, comece por lá.
- **Versão iOS:** `ios:release` só bumpa o build number (`CURRENT_PROJECT_VERSION`). A **versão pública (`MARKETING_VERSION`) é bumpada à mão** no `project.pbxproj` (**10 ocorrências** hoje — confira com `grep -c`, não confie no número) antes de um release novo. Ver "iOS — release" pra saber QUANDO ela precisa subir.
- **App Store Connect API — está TUDO no repo, não peça ao dono.** Chave em `~/.appstoreconnect/keys/AuthKey_W834H36CBM.p8`; `ASC_KEY_ID` e **`ASC_ISSUER_ID` no `.env.local`**, lidos sozinhos por `scripts/ios-submit.mjs` (submete pro review sem painel web; `--dry-run` primeiro). Esta linha dizia "o Issuer ID não fica no disco (pegar no painel)" e **estava errada** — em 03/08/2026 o agente acreditou, parou o trabalho e foi pedir ao dono um dado que estava a um `grep` de distância, com o script de submissão pronto ao lado. Detalhes em `docs/ios-release.md`.

### Qual modelo Gemini o app usa — e por que existe um REGISTRO (24/08/2026)

**Padrão: `gemini-3.1-flash-lite`, e ele mora em `utils/ai/modelRegistry.ts`.
Não digite o nome de um modelo em nenhum outro lugar** — há source-guard de
classe que reprova.

O registro nasceu de um susto: o default de `env.gemini.modelId` era
`gemini-1.5-pro`, **desligado pelo Google em 24/09/2025**, e as ~20 rotas de
`api/ai/` leem esse getter. Nada quebrou porque a env var
`GOOGLE_GENERATIVE_AI_MODEL_ID` está setada na Vercel — ou seja, **a IA inteira
dependia de uma variável de ambiente não estar faltando**, e o default existia
justamente para esse caso. O fallback interno do wrapper apontava para
`gemini-2.5-flash`, com desligamento anunciado para ≥ 16/10/2026: o plano B
também tinha validade.

**O saneamento roda na CHAMADA (`getGeminiModel`), não só no default** — em
produção quem escolhe o modelo é a env var, num painel que este repo não alcança
pela CLI. Se dependesse de alguém editar a var, a migração não chegaria ao ar.
Modelo desligado ou em retirada é trocado pelo padrão, com `logWarnRemote`
deduplicado por processo. **Modelo de outra MODALIDADE passa intacto de
propósito** (`*-image`, `imagen-*`, `*-tts`, `*-native-audio`): trocar um gerador
de imagem por um de texto devolveria prosa a quem pediu imagem — falha
invisível, pior que o 404 que o saneamento evita.

**Por que o 3.1-flash-lite** (medido, não pelo folheto): $0,25/$1,50 por 1M
contra $0,30/$2,50 do 2.5-flash (**−40% na saída**) e Intelligence Index 34
contra 21. Ou seja, mais barato E melhor — é raro, e é por isso que a troca não
teve trade-off.

**Duas coisas que a documentação do Google diz e a API contradiz** — as duas
medidas contra a chave de produção em 24/08/2026:

1. *"Thinking não pode ser desligado no Gemini 3"* — **a API aceita
   `thinkingConfig: { thinkingBudget: 0 }` e o respeita** (`thoughtsTokenCount:
   0`). O wrapper continua injetando isso em todo modelo flash, e continua
   valendo: sem ele, o mesmo prompt de duas linhas gastava 78 tokens de
   raciocínio. Não "conserte" isso para `thinkingLevel`.
2. *"Troque `thinking_budget` por `thinking_level` e remova `temperature`"* —
   **`thinkingLevel` não existe no `generationConfig` da v1beta e devolve 400**
   (`Unknown name "thinkingLevel"`). E `temperature` segue aceito. A migração
   foi **drop-in**: nenhum contrato de rota em `routeContracts.ts` mudou.

Testado antes de virar padrão: texto, JSON estruturado (`responseMimeType` +
`responseSchema`), entrada multimodal com imagem (OCR correto) e streaming — 200
nos quatro. Qualidade conferida com o prompt real de estimativa de macros em 4
refeições brasileiras: JSON válido em 4/4, números equivalentes.

**Transcrição por ÁUDIO: os modelos existem, e o app NÃO os usa (27/08/2026).**
Conferido contra a chave de produção: `gemini-3.5-transcribe` e
`gemini-3.5-transcribe-live` estão entre os 53 modelos que ela alcança, e o SDK
novo (`@google/genai`) já está instalado. Quem transcreve hoje é o APARELHO —
Web Speech no navegador, `SFSpeechRecognizer` no iOS —, de graça; o Gemini só
limpa a bagunça depois, e o prompt de `parse-exercise-voice` diz isso com todas
as letras ("corrija erros de transcrição de voz, ex: 'super intro' → 'Supino
Reto'"). **Adotar é SOMAR custo, não trocar**: o transcribe devolve texto, não a
estrutura de exercícios, então seriam duas chamadas onde hoje há uma. O que ele
compra de verdade é (a) vocabulário personalizado de até 1.000 termos — a lista
de exercícios do usuário e o jargão que nenhum reconhecedor genérico conhece —,
e (b) entrada por voz onde não existe nenhuma, como lançar refeição.

⚠️ **Se um dia adotar, `-transcribe` PRECISA entrar em `OTHER_MODALITY_PATTERNS`.**
A lista de hoje cobre `-image`, `imagen-`, `-tts`, `-native-audio`, `-live`,
`-computer-use` e `robotics`: o `-live` protege o `transcribe-live` por acidente,
e **`gemini-3.5-transcribe` não casa com nada**. Passa intacto agora, mas no dia
em que a família 3.5 entrar em `SUNSETTING_PATTERNS` (hoje só `^gemini-2\.5`) ele
seria trocado pelo modelo de TEXTO — o app pediria transcrição e receberia prosa,
exatamente a falha invisível que aquela lista existe para evitar.

⚠️ **A voz DERRUBAVA O APP — crash medido e corrigido em 28/08/2026.**
`IronTracksNativePlugin.startSpeechRecognition` lia o formato do `inputNode` e
instalava o tap **antes** de pôr a `AVAudioSession` numa categoria de gravação.
Fora de `.record`/`.playAndRecord` o nó de entrada não existe:
`outputFormat(forBus:)` devolve 0 canais / 0 Hz e `installTap(onBus:)` lança
**NSException do Objective-C — que Swift não captura com `do/catch`**. SIGABRT,
app fechado, nenhum log para o usuário.

E o estado de partida era exatamente esse: `stopRecognitionEngine()` e o
AppDelegate deixam a sessão em `.playback` (para a música do usuário continuar).
O crash não era caso raro — era o caminho comum. Reproduzido no simulador nos
DOIS pontos de entrada (criar treino por voz e o ditado novo da nutrição), e a
pista veio do `.ips` em `~/Library/Logs/DiagnosticReports/`, não do JS: pelo
lado web o sintoma é o app "sumir da tela", sem erro nenhum.

Hoje a sessão é configurada primeiro, e há uma guarda que recusa iniciar quando
o formato vem inválido (`no_audio_input`) em vez de matar o processo. **Mudança
NATIVA: só chega ao usuário com build nova no TestFlight.**

**A voz alcança o caminho nativo no iPhone — suspeita MEDIDA e derrubada
(28/08/2026).** Esta nota já disse o contrário: que o guard
`if (!SpeechRecognitionAPI) return` (`VoiceWorkoutModal.startRecording`, linha
411) barraria o iPhone antes do bloco `if (isIosNative())` (482) que usa o
`SFSpeechRecognizer`, deixando o microfone do assistente morto no aparelho de
toda a base.

Medido no simulador contra PRODUÇÃO, no caminho real (Criar treino → Por Voz →
tocar no microfone): aparecem os DOIS prompts nativos do iOS, primeiro o do
microfone e depois o do **Reconhecimento de Voz** — e quem pede o segundo é o
`SFSpeechRecognizer`. Ou seja, o WKWebView expõe `webkitSpeechRecognition`, o
guard passa, e o caminho nativo é alcançado.

A ordem dos dois blocos continua frágil (o guard fala de uma API que o caminho
nativo não usa), mas **não há bug aqui** — não "conserte" isso atrás de um
sintoma que não existe.

**Como saber o que a chave alcança hoje** (grátis, não custa chamada):
`GET https://generativelanguage.googleapis.com/v1beta/models?key=$K` — traz
`supportedGenerationMethods` e a lista real. Faça isso antes de supor que um
model id existe.

### Antes de dizer "não tenho X", procure X no repo
Vale para credencial, script, endpoint, chave — qualquer coisa. Parar e pedir ao dono
algo que já existe custa a sessão inteira dele, e é o erro mais caro que dá pra cometer
aqui: o trabalho já estava feito.

- **Nota que descreve o que NÃO temos é a que apodrece primeiro.** Ninguém volta pra
  apagá-la quando a lacuna é preenchida. Trate "não existe / falta / preencher quando
  pego" como **pista datada**, nunca como fato — inclusive neste arquivo.
- **A varredura mínima leva 30 segundos:** `.env.local` e `.env.example`, `scripts/`,
  `package.json` (um script pronto costuma existir), e `grep -ri "<termo>"` no repo.
- Confirmou que a lacuna é real? **Corrija a nota** que dizia o contrário, na mesma
  tarefa — senão o próximo agente cai no mesmo buraco.

## Build da Vercel morrendo em "Running TypeScript" — é OOM (06/08/2026)
**Sintoma:** o deploy de produção fica ~45 min em `Running TypeScript ...` depois
de `✓ Compiled successfully`, e termina em `BUILD_EXCEEDED_MAXIMUM_TIME` ou
`Command "npm run build" exited with SIGKILL`. O relatório do build diz
`At least one "Out of Memory" ("OOM") event was detected`. Aconteceu duas vezes
seguidas e deixou a produção **um dia inteiro sem atualizar** — e o app nativo
carrega o front do servidor, então isso segura TODOS os usuários, não só a web.

**Não é o código:** o preview do mesmo commit fica `READY` normalmente. Antes de
investigar código, olhe o estado do deploy — `mcp__…vercel…__get_deployment` traz
`errorCode`, e `get_deployment_build_logs` mostra o relatório de OOM. O status do
GitHub só diz "pending" e engana.

**Hipótese que JÁ foi testada e DESCARTADA — não repita:** "o `tsconfig.json`
inclui `**/*.ts`, então o build está checando os ~457 arquivos de teste". Medido:
`tsc` com testes = **1552 MB**, sem testes = **1537 MB**. Diferença de 1%. Um
`tsconfig.build.json` excluindo testes não resolve nada.

**Onde a memória vai:** build local completo = 47 s e pico de 2,6 GB — e local
NÃO sobe sourcemaps, porque `SENTRY_AUTH_TOKEN` não existe fora da Vercel
(`next.config` desabilita quando falta o token). Lá o upload de centenas de
`.js.map` roda antes do `tsc`, e é a soma que estoura o container. Por isso o OOM
não reproduz na máquina local.

**O que fazer, nesta ordem** (tudo no painel da Vercel — nenhum é mudança de código):
1. env var `NODE_OPTIONS=--max-old-space-size=6144` no projeto;
2. subir a Build Machine (Settings → Build & Development);
3. último recurso: desligar `sourcemaps` do Sentry — custa stack trace legível em produção.
Depois, **Redeploy** no commit atual do `main`.

## Boot em loop no iPhone ("pisca na tela de carregamento e não entra") — ago/2026

Sintoma relatado por usuária real: abre o app, fica piscando no splash, **só
desinstalar e reinstalar resolve**. Não é cache nem chunk stale — é ricochete de
navegação, e o que o reinstalar apaga é o `localStorage`.

**A causa:** `it.logged_in` é uma marca gravada no login que **nunca expira e
nada apagava**. A raiz confiava nela e mandava para `/dashboard`; o
`dashboard/layout.tsx` conferia a sessão de verdade e devolvia para
`/?next=/dashboard`. Ping-pong infinito, uma navegação COMPLETA por volta.
Reproduzido em produção: documento novo a cada ~5 s, indefinidamente.

**Por que o salva-vidas não salvava:** o botão "Voltar ao início" do
`LoadingScreen` aparecia após 8 s — mas o componente morria a cada volta e o
`setTimeout` renascia do zero. Ele era inalcançável exatamente no caso para o
qual foi escrito. **Detector de loop não pode viver em `useState`/`useRef`: tem
que sobreviver à recarga que ele existe para detectar.** Daí `lib/auth/bootBounce.ts`,
que conta no storage — fonte única, usada pelos dois lados e pelo `LoadingScreen`.

Fronteira do freio: ao disparar ele apaga só `it.logged_in`, **nunca os cookies
`sb-*`**. Um dos caminhos do loop roda com sessão VÁLIDA (o dashboard expulsa
quando o `userId` não hidrata em 3 s), e ali limpar cookie deslogaria um usuário
legítimo por causa de conexão ruim.

## ⚠️ O middleware NÃO RODA desde 27/02/2026 — e o app está SEM CSP

Verificado em 10–11/08/2026. **Não reinvestigar do zero: as provas estão aqui.**

`middleware.ts` mora na RAIZ, mas as rotas vivem em `src/app/` — nesse layout o
Next só reconhece `src/middleware.ts`, e na raiz o arquivo é ignorado **em
silêncio**, sem erro e sem aviso no build. Quatro provas independentes:

* `.next/server/middleware-manifest.json` → `"middleware": {}`
* `console.log` no corpo da função nunca imprime, nem em dev
* `https://www.irontracks.com.br/` responde **200** em vez do 307 para o apex,
  que é a PRIMEIRA coisa que o arquivo faria
* produção **não devolve header `Content-Security-Policy`** (nem meta tag)

**Linha do tempo (git):**

| Data | Commit | O que houve |
|---|---|---|
| 20/02/2026 | `ca3b0575` | `src/middleware.ts` criado, 116 linhas, num commit de **segurança**: `updateSession` + gate 401 nas rotas `/api/` + CSRF por Origin/Referer + CSP com nonce |
| 27/02/2026 | `ee61f30e` | commit "deploy: 2026-02-27-0925" **renomeia `src/middleware.ts` → `src/proxy.ts`** (`R098`). Middleware desativado. `src/proxy.ts` depois some do repo |
| 07/03/2026 | `ebfb2606` | "restore all missing root config files … middleware … (deploy fix)" recria como **`middleware.ts` na raiz**, versão reduzida (46 linhas): sem gate de API, sem CSRF, sem lista de rotas públicas. E na raiz não carrega |

Mesmo padrão de perda por reescrita de histórico que sumiu com as tabelas de
treino em dupla (aquelas foram recriadas no #859) — vale suspeitar dele em
qualquer "isso deveria existir e não existe" datado de fev–mar/2026.

**O que está de fato quebrado (medido, não presumido):**

1. **Sem CSP em produção há ~6 meses.** `buildCspHeader`/`applySecurityHeaders`
   (`utils/security/headers.ts`) são usados **exclusivamente** pelo middleware
   morto. O que sobra vem do `async headers()` do `next.config.ts`:
   `x-frame-options`, `x-content-type-options`, `referrer-policy`, HSTS — e foi
   justamente isso que mascarou a ausência, porque a resposta "parece" protegida.
2. **`updateSession()` nunca roda** — a renovação de sessão do `@supabase/ssr` a
   cada navegação não existe neste app. Suspeita **não confirmada** de ser a
   razão de sessões morrerem sozinhas e caírem no ricochete de boot acima.
3. **`www` não redireciona para o apex.**

**O que NÃO está aberto** (conferido um a um, para ninguém gastar auditoria de
novo): o gate de API do middleware era defesa em profundidade — **252 das 258
rotas** validam sozinhas, e as 6 restantes são públicas por desenho ou protegidas
por outro mecanismo (`requireRoleOrBearer` no `admin/students/assign-teacher`,
assinatura QStash no `rest/fire`). A CSRF genérica também está mitigada:
`getSupabaseCookieOptions()` usa `sameSite: 'lax'`, então POST cross-site não
carrega o cookie de sessão.

### Ativado em 11/08/2026 — o CSP nasceu em modo RELATÓRIO (bloqueia desde 27/08)

O arquivo foi movido para `src/middleware.ts` e **hoje roda**. O que ele faz:
renova a sessão (`updateSession`), redireciona `www` → apex e aplica os security
headers + CSP.

**O atalho `/` → `/dashboard` NÃO voltou, de propósito.** Ele subia só por VER um
cookie, sem conferir se valia, e o dashboard devolvia — era metade do ping-pong
do boot, na versão SERVIDOR, que nenhum contador do cliente alcança porque nenhum
JS chega a rodar. O ganho era cosmético e hoje é redundante (o `useLoginScreen`
faz isso conferindo a sessão). Guard em `lib/auth/__tests__/bootBounce.test.ts`.

**`/api/` fica fora do matcher:** `updateSession` faz um `getUser()` (ida à rede)
por request, e ligá-lo em 258 rotas somaria latência a cada chamada sem ganho —
elas já autenticam sozinhas.

**A renovação é MELHOR-ESFORÇO nos dois níveis** (`try/catch` no `getUser()` e em
volta do `updateSession`). O que roda em toda navegação não pode ter caminho que
lance: um throw vira 500 no site inteiro de uma vez — e, como o app nativo carrega
o front deste servidor, levaria junto todos os aparelhos instalados.

**CSP: `Content-Security-Policy-Report-Only` foi o padrão até 27/08/2026** (hoje
o default BLOQUEIA — ver a seção da inversão de polaridade abaixo). Uma política que nunca
rodou quebra terceiros em silêncio — e isso não é teórico: os PRIMEIROS relatórios
que chegaram foram `script-src-elem ← browser.sentry-cdn.com` e
`← va.vercel-scripts.com`, ou seja, em modo bloqueante o app teria perdido o
Sentry e a analítica sem ninguém perceber. Os dois já entraram na allowlist.
Violações vão para `POST /api/security/csp-report` → Sentry
(`security.csp.violation`) **e `audit_events`** — o Sentry sozinho não serve para
decidir, porque o token não existe neste repo e a pista fica ilegível de onde se
investiga (mesma lição da Live Activity). A consulta para ler as violações está
mais abaixo, na versão COM o filtro de `documentHost` — a sem filtro só mostra
preview e engana.

A rota é **pública e escreve** (o navegador posta sem sessão — é assim que o
mecanismo funciona), então os freios são rate limit por IP, dedupe por par
(diretiva, origem) e teto de linhas por instância. A pergunta é QUAIS diretivas
quebram, não quantas vezes.

**Primeira janela lida em 12/08/2026 (24 h, 16 eventos) — e ela pagou por si.**
Duas origens, as duas do PRÓPRIO app e nenhuma no header: `api.cloudinary.com`
(o provedor de storage — em modo bloqueante teria caído TODO upload de imagem:
avaliação corporal, avatar, story) e `itunes.apple.com` (o lookup que alimenta o
aviso de nova versão). As duas entraram no `connect-src`; guard em
`utils/security/__tests__/cspConnectSrc.test.ts` cobra que o chamador continue
existindo. **Ligar o enforce antes dessa janela teria derrubado o upload de fotos.**

✅ **O enforce está LIGADO desde 27/08/2026** — e a polaridade foi INVERTIDA:
o default agora BLOQUEIA, e `CSP_ENFORCE=false` na Vercel é o freio de
emergência (env var, sem deploy). Antes, proteger dependia de alguém lembrar de
setar `=true`; hoje o esquecimento cai para o lado seguro. Regra em
`cspEnforcedFrom` (`utils/security/headers.ts`), testada por comportamento —
só a string exata `false` desliga.

A decisão que faltava era sobre a única origem viva, e o dono autorizou
bloquear. Histórico da coleta, que continua valendo como método:

**Filtre por `documentHost`, senão a leitura engana.** A pergunta é "o que
quebra em PRODUÇÃO", e o grosso do volume é de PREVIEW: `vercel.live` soma
**509 eventos** (script-src-elem + frame-src) e **100% deles em
`*.vercel.app`** — é a Vercel Toolbar, que a plataforma injeta nos deploys de
PR. Zero em `irontracks.com.br`. Ligar o enforce não a afeta.

```sql
select metadata->>'directive' as diretiva, metadata->>'blocked' as origem,
       count(*) as n, max(created_at) as ultimo
from audit_events where action = 'csp_violation'
  and metadata->>'documentHost' not like '%vercel.app'   -- ← sem isto, só se vê preview
group by 1,2 order by 3 desc;
```

Em produção, tudo que já tinha sido tratado **parou de aparecer**, o que valida
a allowlist: `itunes.apple.com` e `api.cloudinary.com` mudos desde 12/08,
`res.cloudinary.com` desde 13/08, `inline` (2 eventos) desde 13/08, `www.` desde
14/08 (o middleware redireciona).

**Sobra UMA origem viva: `connect.facebook.net`** (script-src-elem, 6 eventos,
o último em 22/08, em `irontracks.com.br`). E **não existe pixel do Meta no
repo** — `grep` em `src/` e `public/` não devolve nada. Suspeita fundamentada,
**não confirmada**: é o navegador embutido do Instagram/Facebook injetando o
próprio script quando alguém abre o link do app por lá. Se for isso, bloquear é
o comportamento CORRETO (é injeção de terceiro em que o app não toca) e nada de
funcional se perde. Antes de virar a chave, alguém precisa dizer se algum
material de marketing depende desse pixel.

Autorizado pelo dono em 27/08/2026 e ligado no mesmo dia. **Se algo quebrar, o
rollback é `CSP_ENFORCE=false` na Vercel** — env var, sem deploy, volta na hora
para Report-Only. Vale conferir a janela alguns dias depois: origem legítima que
não apareceu nas três leituras aparece agora como quebra, não como relatório.

Lembrete que continua valendo: o `script-src` de produção é mais restrito que o
de dev (que tem `unsafe-inline` e `unsafe-eval`), então dev NÃO prova nada sobre
produção.

## Regra crítica: `npm run deploy` deve sempre funcionar
O deploy usa `husky` + `lint-staged` com **zero tolerância a warnings ESLint**. Qualquer warning bloqueia o commit e o deploy falha.

## Suíte de testes — DOIS projetos por ambiente

`vitest.config.ts` roda `.test.tsx` em **jsdom** e `.test.ts` em **node** (2,5× mais rápida: 322s → ~120s). `.test.ts` que mexa em DOM precisa estar em **`vitest.domTests.ts`**, senão quebra com um confuso `document is not defined` — o guard `src/__tests__/vitestDomProjectList.test.ts` cobra a lista e falha com a instrução exata.

`testTimeout` é **15s**, não o default de 5s: a suíte falhava de forma NÃO determinística porque o primeiro caso de um arquivo com `await import()` dinâmico levava 6s sob contenção (isolado roda em 1,3s). Timeout serve para pegar teste TRAVADO, não teste lento sob carga.

### Teste que muda de resultado conforme o DIA não é flaky — é teste que às vezes não testa nada (ago/2026)
`myDietPlan > trocar alimento manda o DIA selecionado` derrubou o CI e parecia
flaky. **Não era**: escondia bug de produto (ver `MyDietPlan`, abaixo).

O que custou caro foi o método. **62 execuções locais passaram** — 15 do caso
isolado, 15 do arquivo, 8 da suíte inteira, 10 com a CPU saturada, 12 com
`--sequence.shuffle`. Força bruta não acha corrida rara: é caça a fantasma.

**O que achou em 2 minutos:** fixar o relógio e varrer os SETE dias da semana. O
teste falhava em seis e passava só na quarta — o único dia em que o
posicionamento automático já acertava o índice esperado e o clique não precisava
funcionar. Sem `setSystemTime`, ele tinha 6/7 de chance de pegar o bug e passava
por sorte; o runner do CI, mais lento, ampliava a janela.

Regra que fica: **todo teste que dependa de "hoje" fixa o relógio**, e quando o
resultado esperado varia com o calendário, o guard **varre a semana inteira** —
senão ele passa sozinho no dia certo. Mesmo raciocínio vale para fuso e virada
de mês.

## Guard falso — os oito jeitos de errar que já aconteceram aqui

Todo guard deve ser provado por mutação (vermelho com o bug, verde sem). Padrões que passaram verdes COM o bug presente:

1. **Tautológico** — assertar `toBe(MIN_MINI_SETS)` em vez do literal `2`: baixar a constante muda a expectativa junto.
2. **Acusando o próprio comentário** — source-guard que procura o padrão proibido e casa com a documentação que explica por que ele é proibido. Reduza ao código executável (fora comentário, string, template, regex) antes de casar.
3. **Cobrindo as pontas e não a fiação** — algoritmo e coletor corretos isoladamente, e ninguém ligando os dois. Foi assim que remover `knownWeights` da chamada no hook deixou 198 testes verdes.
4. **Proibindo o consumo CORRETO** — source-guard mirando o NOME do campo (`bodyWeightKg`…) em vez da FONTE: `p.bodyWeightKg` vindo do leitor único é exatamente o certo, e o guard reprovava. Mire em quem LÊ a tabela, não em quem usa o dado (ago/2026, `userSnapshot`).
5. **O teste que não existe** — declarar "provado por mutação" sem conferir que o caso foi mesmo inserido no arquivo. Um `replace` de script que não casa deixa o teste fora, e a mutação passa verde porque **nada** o exercita. Rode `vitest -t "<nome do caso>"` e confirme `1 passed`, não `0 passed | N skipped`.
6. **Ancorado no que a mudança faz DESAPARECER** — o guard cita uma string que deixou de existir e fica sem alvo. Duas formas, a segunda medida em 27/08/2026: (a) *migração* — ao trocar classe literal por token (`text-violet-300/80` → `MACHINE_ACCENT.text`), `plateHint` e `valorVsSugestao` seguiram procurando a string antiga, verdes e cegos; (b) *a própria correção* — `abasNaoVisitadas` fatiava o botão de Voltar por `{!onClose ? … }`, que era **a expressão do bug corrigido**, e `cronometroDescansoUmDono` provava "o tempo extra é da barra" exigindo a frase `"além do planejado"`, que era a duplicata removida. **Ancore no que vai FICAR** — o `aria-label`, a FONTE, o contador que sobrevive —, nunca no que a correção vai apagar. E note por que os dois avisaram em vez de emudecer: ambos tinham um caso do tipo `expect(bloco).not.toBe('')`. Esse caso é o que separa "guard que reclama" de "guard que fica cego."
7. **Casando com a REFERÊNCIA, não com a seção referida** — `toContain('Fase 3½')` passou verde com a fase inteira renomeada, porque outro parágrafo do mesmo arquivo dizia "a Fase 3½ decidiu". Em documento, mire no TÍTULO (`^### Fase 3½`); e quando o padrão aparece mais de uma vez, **assere dentro do BLOCO** daquela seção, não no arquivo todo — senão apagar a regra de um lugar passa despercebido porque ela existe em outro. Medido por mutação em 25/08/2026, nos guards do próprio `/documentar`.
8. **LARGO DEMAIS — o oposto do cego, e igualmente inútil** (27/08/2026). Guard que acusa uso CORRETO é afrouxado na primeira semana, e aí não protege mais nada. Três tentativas minhas na mesma sessão, todas descartadas depois de medir: `font-mono text-xs` (para achar painel de stack) acusou volume tabular, percentual de som e coluna de tabela; `text-red-* + font-mono` acusou o contador de créditos esgotados, o cronômetro em overtime e o painel **admin** de erros, onde a stack é o produto; `red-` no arquivo das dobras acusou a validação de formulário. A conclusão que ficou: **a combinação de classes não identifica o defeito — o que identifica é ONDE ela aparece.** Restrinja o guard ao escopo (as superfícies de erro, as funções de status) em vez de abrir exceção para cada uso legítimo; allowlist com seis entradas é o papel de parede que este repo já aprendeu a não construir.

## Antes do /clear: `/documentar`

O que sobrevive ao `/clear` é o que estiver no `CLAUDE.md` — a conversa some
inteira. O protocolo de destilar a sessão (o que merece nota, o que é changelog,
como caçar a nota que a tarefa tornou FALSA, e o orçamento deste arquivo) está em
**`docs/skill-documentar.md`**, versionado. O comando `/documentar` só aponta
para ele.

Duas regras de lá que valem mesmo sem rodar o comando: **armadilha que dá para
eliminar deve ser eliminada, não documentada** — nota que descreve um perigo
evitável vira folclore; e **regra de comportamento do agente vai para o
`~/.claude/CLAUDE.md` global**, não para este arquivo, que é sobre ESTE repo.

## Checklist obrigatório antes de declarar qualquer tarefa concluída
1. **TypeScript:** `npx tsc --noEmit` — zero erros, sem exceção.
2. **ESLint (comando exato):** `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs <arquivos_editados> --max-warnings 0` — output vazio = limpo. Em worktree, ver Gotchas.
3. **`npm run test:unit`** se tocou lógica de negócio; **`npm run test:smoke`** se tocou rotas ou APIs.

## Topo da aba TREINOS — a regra do espaço nobre (11/08/2026, PR #747)

**Quando um card do topo some, ALGUÉM tem que assumir o espaço.** Se ninguém
assume, quem sobe é o bloco seguinte — e o seguinte raramente é o certo.

Foi o que aconteceu: o `QuickStartCard` devolvia `null` para quem já tinha
treinado no dia, e o vazio era preenchido por gravidade pelo **estado vazio da
barra de stories**. Resultado medido no iPhone 17 Pro Max: cabeçalho + abas
(~190pt) + stories vazio (~167pt) + três CTAs de criação (~220pt) = **cerca de
dois terços da primeira tela antes do primeiro treino**, numa aba chamada
TREINOS. A aba de execução abria convidando a publicar foto.

Duas regras que ficam:

1. **Estado vazio não tem o peso de card cheio.** Quando não há nada para
   mostrar, ocupe pouco. O de stories era ícone em círculo + título + subtítulo
   + botão sólido dourado; virou uma linha. E **sem dourado** — a cor é da ação
   primária, não de convite social.
2. **`return null` num card de topo é uma decisão, não um atalho.** Antes de
   devolver nada, pergunte o que sobe no lugar.

Detalhes de tipografia do `WorkoutCard` que valem além dele: a linha de meta não
leva `pr-40` (ela fica ABAIXO do bloco de ações — o padding só estrangulava o
texto e deixava o separador `·` órfão), e o título não força `uppercase` (custa
~12% de largura; a assinatura do app é o **peso**, não a caixa). Guards em
`components/dashboard/__tests__/dashboardTopoTreinos.test.ts`.

**Como desfazer, se o dono não gostar** — tudo entrou em UM commit de squash:

```bash
git revert --no-edit 6ac1dd63871c272e2541c587636c58d6fc8fe8c9
```

**O revert foi ENSAIADO antes de a mudança ser entregue**, não só documentado:
aplicado numa branch descartável, ele entra sem conflito (8 arquivos, −236
linhas) e o estado revertido passa em `tsc` e nos 5107 testes. Um rollback que
ninguém tentou é promessa, não plano.

O deploy web leva a reversão a todos os aparelhos no próximo boot — **sem
TestFlight**, porque o app nativo carrega o front do servidor. Os guards novos
voltam junto (estão no mesmo commit), então não sobra teste órfão cobrando um
comportamento revertido.

**Segunda rodada (PR #749):** os três atalhos de CRIAR (Novo/Express/Cardio)
ocupavam ~220pt antes da lista e agora ficam recolhidos atrás de um botão
"Criar treino" — **mas só para quem já tem treinos**. Com a lista vazia eles
seguem abertos: no onboarding criar É a ação primária, e recolher esconderia a
única coisa que o usuário pode fazer. O botão fechado usa dourado DISCRETO;
dourado sólido pertence ao CTA de iniciar. Revert: `git revert --no-edit
1c0fa89158f4bc13a6d69d8166b4b1835870c746`.

Resultado medido no aparelho: a lista de treinos subiu ~196pt e passaram a
caber **três cards na primeira tela** (dois inteiros + o começo do terceiro),
contra nenhum card inteiro antes.

**Reverter em parte** também é possível: as correções são independentes.
O `git revert` desfaz o pacote; para desfazer só uma (ex.: manter o topo novo e
voltar o `uppercase` do título), edite o arquivo e apague o guard correspondente
em `dashboardTopoTreinos.test.ts` — ele foi escrito para falhar exatamente nesse
caso, e é assim que ele avisa que a decisão está sendo revertida de propósito.

## Área administrativa — a sala que não tinha passado pela régua (28/08/2026)

Painel de Controle: **15 abas em 4 categorias** (`admin-panel/adminPanelTabs.ts`);
Área do Professor: **7 seções** que reusam os MESMOS componentes de aba numa
casca própria (`teacher-area/teacherAreaSections.ts`). A navegação é boa e a
decisão está documentada no próprio arquivo — o que faltava régua era o
conteúdo.

⚠️ **Lista fixa de categorias apodrece contra o banco.** O gráfico "Status dos
Alunos" tinha cinco colunas — Pago · Pendente · Atrasado · Cancelar · Outros — e
a tabela `students` tem **dois** status: `pago` (32) e `ativo` (24). Três colunas
permanentemente vazias, e **43% da base rotulada como "Outros"**, porque `ativo`
não estava na lista. Ninguém olhou o gráfico depois de escrevê-lo. Hoje as
categorias saem de `lib/admin/studentStatus.ts`, que agrupa pelos status que
APARECEM — status novo no banco ganha nome sozinho, e a tabela de conhecidos só
dá rótulo e cor melhores, **nunca filtra o que pode ser exibido** (senão o
próximo status volta a cair em "Outros").

Dois defeitos de vocabulário no mesmo lugar: **"Cancelar" é verbo** (rótulo de
botão, não de estado) e **aluno sem status virava "Pendente"**
(`String(raw || 'pendente')`), inventando categoria que o banco não tem — hoje é
"Sem status", que é a verdade e é acionável.

⚠️ **ABERTO — card e gráfico ainda contam "pendente" por regras diferentes.** O
card do dashboard exige `status === 'pendente'` e ignora vazio
(`DashboardTab.tsx:87`); o módulo novo trata vazio como "Sem status". Enquanto a
base estiver limpa os dois concordam; no dia em que entrar aluno sem status, o
painel se contradiz na mesma tela. A fonte única é trabalho de Sprint 2.

**Padding no topo de um container que hospeda bloco `sticky` vira FRESTA.** Os
chips de sub-aba são `sticky top-0` dentro do container de rolagem, e o `pt-2`
dele ficava ACIMA da zona de grude: na aba Alunos aparecia uma faixa com "Pago",
"MK" e dois ícones cortados ao meio, presa entre o cabeçalho e os chips, o tempo
todo em que se rolava. Parecia defeito de renderização. O respiro do conteúdo
mora no filho, que rola junto.

**O badge de pendentes só recontava ao NAVEGAR** (o efeito dependia de
`currentTab`) — e o caminho natural é abrir Solicitações e despachar várias sem
sair da aba. Hoje há `lib/admin/solicitacoesEvent.ts`. Badge que mente é pior
que badge nenhum: ele é a única razão de o admin abrir aquela aba.

**Jargão de métrica não é vocabulário de usuário.** A fila do coach abria com
"Coach Inbox" e quinze cartões "RISCO DE CHURN" em vermelho, com botões
"Enviar mensagem / Soneca / Feito" logo abaixo. Hoje "Sua fila" e **"Sumido"** —
que cobre os dois casos reais (parou de vir e nunca veio), o que "Parou de
treinar" não cobriria. `churnDays` continua sendo chave de API.

**O que está CERTO e não deve ser "corrigido":** a exclusão de aluno e de
professor pergunta antes, lista o que se perde e tem a polaridade correta
(`cancelText: 'Manter'`); o `overflow-x-hidden` do container é obrigatório (ver
o comentário no arquivo — a página inteira deslizava); e o `TabErrorBoundary`
por aba impede que uma aba quebrada derrube o painel.

**Sprint 2 — o vocabulário de status tinha CINCO donos (29/08/2026).** A mesma
decisão estava escrita em cinco lugares, com conteúdos diferentes: as opções do
`<select>` (`STATUS_OPTIONS`), o `switch` das classes do badge, os rótulos com
emoji do diálogo de confirmação, as labels do gráfico, e os chips de filtro.
Hoje tudo sai de `lib/admin/studentStatus.ts`.

⚠️ **O `<select>` de status não oferecia `ativo` — o status de 24 alunos (43%).**
Um `<select>` cujo `value` não casa com nenhuma `<option>` não consegue exibir o
estado real: o navegador cai na primeira opção. Hoje `opcoesDeStatus(atual)`
sempre inclui o status atual, mesmo desconhecido — a classe do problema, não o
caso. Pelo mesmo motivo os chips de filtro passaram a sair dos DADOS: havia um
chip "Ativos" que filtrava `pago` e nenhum para `ativo`, então aqueles 24 alunos
não eram alcançáveis por filtro nenhum.

⚠️ **"Ativos" significava duas coisas na mesma tela.** O card do topo contava
`status = 'pago'` (28) e o gráfico, uma rolagem abaixo, mostrava `Ativo` (20).
O card virou **PAGANTES**. Guard de CLASSE: nenhuma contagem de status no
`DashboardTab` pode normalizar à mão — mirar em `|| 'pendente'` deixava passar
`String(u?.status || '').toLowerCase()`, que é a mesma decisão reescrita
(provado por mutação).

**Correção de um achado meu que estava ERRADO:** o relatório dizia que o
`Doughnut` "Status Geral" e o `Bar` "Status dos Alunos" desenhavam o mesmo dado
na MESMA tela. Não desenham — o Doughnut está sob `{isTeacher &&}` e as barras
sob `{isAdmin &&}`. O que era real e foi removido é o **"Distribuição por
Professor"**: 210px de gráfico para dois números que o card TOTAL ALUNOS já diz
em texto ("49" e "25 sem professor").

**Dado sujo conhecido, NÃO corrigido:** `teachers` tem **41 linhas para 7
e-mails distintos**. A UI já mostra 7 (o fetch deduplica), então não é bug de
tela — mexer nas linhas é decisão do dono.

**Sprint 3 (29/08/2026).** Três correções e uma investigação PARADA de
propósito.

**Um admin que também dá aula via "Coach" e nunca "Admin"** — o ternário testava
`isCoach` primeiro (`HeaderActionsMenu`). No IronTracks o admin normalmente
TAMBÉM atende alunos, então o papel de maior alcance ficava invisível justamente
para quem o tem. Hoje `lib/user/rotuloDePapel.ts` devolve os dois ("Admin ·
Coach"), com Admin primeiro — é ele que explica os itens a mais no menu.

⚠️ **O guard disto nasceu FALSO e proibia a forma CORRETA:** o regex
`isCoach\s*\?\s*'Coach'\s*:` casava com `isCoach ? 'Coach' : null`, que é o
conserto. Virou função pura com teste de comportamento; o source-guard ficou só
para travar a fiação. **Lógica de decisão não se guarda por regex.**

**O banner `DIAGNOSTIC MODE` despejava a exceção crua** (`setDebugError("Erro
Catch: " + msg)`), exibida com `break-all` no topo do painel. Mesma classe
varrida no resto do app em 27/08 — esta superfície ficou de fora porque a busca
mirou em `getErrorMessage`/`String(error)` e aqui a forma é outra. O detalhe
continua indo para `logError`.

**Os chips de sub-aba avisam que há mais.** Em "Mais" são oito e cabem três e
meia; o corte do quarto chip era a única pista. O overflow é medido no efeito
que já existia (`scrollWidth - clientWidth`), **sem `ResizeObserver`** — jsdom
não o tem, e as duas coisas que mudam a largura do trilho já disparam aquele
efeito.

⚠️ **Os ~65pt de preto morto no topo continuam SEM causa isolada — e não tente
adivinhar.** Duas hipóteses foram levantadas e as duas caíram na verificação:
(1) `pt-header-safe` (`safe-area + 60px`) explicaria o valor, mas é **código
morto** — está no `globals.css` e ninguém o usa; (2) `fixed` quebrado por
ancestral com `transform` — o painel é `fixed inset-0` dentro de outro `fixed
inset-0`, sem transform no caminho. A conta do header (`pt-safe` 59pt + `py-3`
12pt = 71pt) não fecha com os ~138pt medidos na tela. **Isolar exige medir o DOM
com o app logado**; mexer em safe-area por palpite quebra o topo em todo
aparelho.

**Aberto, do mesmo relatório** (`Relatorio/design-area-administrativa-2026-08-28.md`
— a pasta `Relatorio/` é ignorada pelo git, então o arquivo é local; o que
segue é o resumo que sobrevive):
os quinze cartões da fila continuam sem mostrar há quanto tempo o aluno sumiu
quando ele NUNCA treinou (a API não manda o dado — o que saiu foi a repetição
tripla); e há ~65pt de preto morto acima do cabeçalho — **medido na
tela, causa NÃO isolada** (o `pt-safe` do header sozinho não explica o valor).

## Débito ABERTO em design/a11y (atualizado 12/08/2026, pós-varredura)

O que **não** está feito, para não ser redescoberto nem refeito:

1. **54 usos de 9px em texto corrido** (23 arquivos). Não corrigidos: mexer no
   corpo muda altura de linha e layout em 23 telas, e isso não se entrega sem
   olhar cada uma. **Congelado por teto por arquivo** em
   `__tests__/nonoPixelTextoCorrido.test.ts`, que só desce — o número vinha
   CRESCENDO (47 → 54 em uma semana), porque o piso de 9px virou alvo por
   gravidade. Em corpo, use 10–11px; 9px é para eyebrow label.
2. ~~**CSP_ENFORCE**~~ — **FEITO em 27/08/2026.** Ligado, com a polaridade
   invertida (bloqueia por padrão; `CSP_ENFORCE=false` é o freio).
3. **Quatro modais de método complexo** (Rest-Pause, Drop-Set, Cluster) tiveram
   o X corrigido e provado por TESTE, mas nunca foram tocados na tela.
4. **Ordem de foco e agrupamento nas telas logadas** — bloqueado daqui: exige
   Accessibility Inspector (negado 2×) ou o dono no iPhone. **VoiceOver não
   existe no Simulador.** As 11 janelas de ago/2026 têm a semântica provada por
   guard e por tipo, não por leitor de tela real.

### Fechado em 27/08/2026 — varredura dos 123 achados

A auditoria de design de 26/08 produziu **123 achados** (24 críticos, 82
significativos, 17 de elevação). Em 27/08 os 24 críticos foram verificados um a
um contra o código: **18 já estavam corrigidos** e 6 estavam vivos. Os
significativos foram varridos por sintoma detectável.

O que ficou de fora, com motivo, e NÃO deve ser reaberto sem decisão nova:
`window.prompt` como caixa de cópia do PIX (mexer ali é tocar em pagamento),
4 arquivos com `window.alert` (exigem provider em cada árvore), e os **57
achados que os céticos não chegaram a verificar** — esses precisam ser
confirmados antes de virar trabalho, senão viram caça a fantasma.

### Fechado em 12/08/2026

- **Janelas sem semântica — ZERADO.** 11 das 12 ganharam `dialogProps` +
  `useFocusTrap` + `backdropProps` (PR #779); a 12ª (`TeacherChatHost`) é
  contêiner de tela e foi para `NAO_E_JANELA`. `JANELA_PENDENTE` está **vazia**.
  Backdrop com `role="button"` virou `presentation`: o véu não é controle.
  ⚠️ O #779 deixou a 12ª nas DUAS listas — o filtro não quebra com isso, por
  isso passou despercebido. Hoje um caso do ratchet reprova a duplicata.
- **Alvo de toque** (PR #778) — 90 botões abaixo de 44pt ganharam `.tap-44`,
  que estende a área pelo `::after` **sem mover pixel**. Nenhum falhava o WCAG
  2.5.8 (24×24): é ergonomia de academia, não conformidade. Guard novo, era a
  única frente de design sem ratchet.

### Duas frentes que a MEDIÇÃO derrubou — não reabrir

Custaram meia hora cada e vão custar de novo se a nota não disser:

- **"63% dos botões sem `active:`" NÃO é problema.** A regra global
  `button:active { transform: scale(0.96) }` (`globals.css`) já atende os 1037;
  quem tem `active:scale-*` na classe só sobrescreve (classe vence seletor de
  elemento). Foi erro de método: medir a CLASSE em vez do comportamento
  aplicado. Hoje há guard travando essa regra global.
- **`text-white/50` NÃO fere o AA.** Medido sobre os quatro fundos do app:
  5,33:1 na base e **5,21:1 no pior caso** (depth-3 `#1a1a18`). Quem reprova é
  `/45` — 4,47:1 no depth-3 —, e o guard de contraste já o proíbe. O piso `/55`
  é margem estilística, não requisito. **A régua certa é o fundo MAIS CLARO**
  (depth-3), não o `#0a0a0a`.

## Sessão de design 13–14/08/2026 — 21 PRs, e as 5 lições que custaram caro

Sequência completa: #783 → #803. O menu inteiro, o Painel de Controle, as cinco
abas, e uma reversão. **Leia as lições antes de mexer em qualquer coisa visual.**

### ⚠️ FUNDO: já quebrei isto uma vez. Não repita.

O shell do dashboard usa **`bg-depth-2` (#151514)**, e o valor foi escolhido por
medição, não por gosto:

| fundo | chão p/ card 3% | salto ao sair da aba |
|---|---|---|
| `#171717` (era) | 1,075 | 1,104 |
| **`#151514` (é)** | **1,072** | **1,083** |
| `#0a0a0a` | 1,051 | 1,000 |

O PR #798 levou o shell para `#0a0a0a` "por consistência com o body" e o dono
reportou: **"ficou todo preto"**. Revertido no #801. O erro não foi de medição —
foi de LEITURA: comparei 1,048 contra 1,063, li "praticamente igual" e ignorei
que **1,048 é quase nenhuma separação**. O fundo mais claro era o CHÃO que
sustentava os cards, e eu tirei o chão achando que tirava uma inconsistência.

**Antes de mexer em fundo: olhe o número absoluto, não a diferença entre dois.**
E mostre no aparelho ANTES de mergear.

### A Nutrição NÃO vive dentro do shell

`NutritionOverlay` é `fixed … z-[25]` POR CIMA do shell, com fundo próprio. Por
isso o #802 (que arrumou o shell) não a alcançou, e ela ficou sendo a única aba
preta até o #803. **Corrigir o contêiner não corrige quem está por cima dele** —
ao mexer no fundo das abas, a Nutrição é um segundo lugar a tocar.

### Pendência ≠ métrica: "isso some quando alguém trabalha?"

O bloco **PRECISA DE VOCÊ** (#794) abre o Painel com o que exige decisão. Pus
"25 alunos sem professor" ali e o dono viu no print: são **26 de 55 (47%)**, 7
deles há mais de 90 dias. Não é fila — é a característica de quem treina sozinho.
Como alerta ficaria aceso para sempre, e bloco que sempre tem item deixa de ser
lido (#795). Virou métrica, colada ao total que divide (#796).

**O teste, que não dá para automatizar:** aluno em risco some quando o coach age;
solicitação some quando você aprova; "sem professor" não some nunca.

### Revert de PR misto leva junto o que não tinha nada a ver

O #798 continha a mudança de fundo E uma correção do guard de paleta (ignorar hex
em comentário). O #801 reverteu tudo — e o guard voltou a acusar o `#171717`
citado no comentário que documenta a medição. Reaplicado no #802. **PR de uma
coisa só.**

### E-mail alheio: corrigir uma tela não é corrigir a classe

O #791 aplicou `publicDisplayName` só na lista de Conversas. A pergunta do dono
("isso está no app todo?") revelou que o mesmo `display_name` — que em **9 dos 58
perfis É o e-mail** — chegava cru no RANKING, na comunidade, no chat, no story e
no `alt` do avatar (#793). Ratchet em `nomeAlheioNasSociais.test.ts` cobre as 5
superfícies sociais. **Telas administrativas ficam FORA de propósito**: professor
e admin precisam ver o e-mail do aluno.

### O que mais entrou (resumo)

- **Notificações por FUNÇÃO** (#792): 23 tipos em 5 funções (ação · conquista ·
  aviso · lembrete · social). `tipo(icone, rótulo, função)` não deixa escolher
  matiz. Guard limita "ação" a 4 tipos — **se tudo vira ação, nada é ação**.
- **Degustação** (#797): o histórico diz o que está VALENDO, não o que foi dado.
  Calcular por `created_at + days` seria inventar fato — um usuário tem 3
  entitlements simultâneos. A verdade é `user_entitlements.valid_until`, e quem
  resolve é a ROTA.
- **Scroll lateral do Painel** (#800): `-mx-4` dos chips + contêiner sem
  `overflow-x-hidden` = a página inteira deslizava. **Quem sangra precisa de
  alguém que segure.** Só 1 dos 11 contêineres similares tem sangria — não saí
  travando os outros.
- **Feed repetia o nome** (#803): título + `${nome} bateu PR:` na mensagem. Não dá
  para tirar na origem (a string alimenta o push); o corte é de exibição e
  condicional.

### Estado ao fim da sessão

- `djmkbrasil` está com **`role = admin`** (pedido do dono, permanente). Valor
  anterior: `teacher`.
- **22 guards** de design/a11y. 5326 testes.
- Débito que ficou congelado, não resolvido: **677 pontos de peso 900 em texto
  miúdo**, 54 corpos de 9px, 29 gradientes inline de CTA.
- Tentei atacar o peso 900 por script e a regex **colapsou JSX em 73 arquivos**
  (revertido antes do commit). Não sai por varredura: cada ponto é a pergunta
  "qual é o elemento primário deste bloco?".

## Varredura do MENU — 9 PRs, 13/08/2026 (etapa FECHADA)

Auditadas as nove telas do menu do avatar. O que ficou de lição vale mais que
as correções: **em seis das nove, o defeito não era feiúra — era um sinal que
tinha parado de significar.**

O quadro tela a tela era changelog e saiu daqui — está nos PRs #783–#791. Dois
fatos dele sobrevivem porque são usados em decisão:

- **Cobranças não existe no iOS** (`hideVipCtas = isIosNative()`, política da
  Apple sobre cobrança fora da loja). Quem mexer em qualquer coisa que aponte
  para lá precisa do mesmo gate — foi o que o tour de coach esquecia até
  27/08/2026, ensinando ao professor de iPhone uma tela que ele não tem.
- **A taxonomia das 23 notificações foi corrigida** no #792 (função, não evento)
  e a COBERTURA no #959. Esta tabela dizia "diagnosticado, não corrigido" e
  ficou falsa por duas semanas.

### As três regras que saíram daqui

1. **Cor semântica não marca categoria.** Aconteceu três vezes em telas
   diferentes: dourado (menu), vermelho (Configurações), vermelho de novo
   (Pendentes com zero). Categoria se comunica por AGRUPAMENTO e RÓTULO — que
   já existiam nos três casos. Gastar o pigmento do alarme em decoração deixa o
   app sem como alarmar.
2. **Alvo pequeno demais nem sempre se resolve ampliando.** Os dots do tour
   tinham 12px entre centros: dar-lhes 44pt criaria 32px de sobreposição, e o
   toque acionaria o passo errado. Quando não há espaço, a saída é deixar de
   prometer interação (`aria-hidden` + navegação em quem tem tamanho).
3. **Guard nasce cobrindo o caso que o motivou.** O de alvo de toque teve TRÊS
   buracos: só via `w-N h-N` casados (155 escaparam por altura), só varria
   `src/components` (mais 15 em `src/app`), e nunca viu `style` inline (os dots).
   Ao escrever guard, a pergunta não é "pega o meu caso?" — é **"onde ele NÃO
   olha?"**.

### Decisões que ficaram com o dono (não são falta de tempo)

- Taxonomia das 23 notificações: agrupar por FUNÇÃO (conquista · atividade ·
  social · aviso · neutro) em vez de por evento.
- Conversas mostra CONTATOS, não conversas: falta prévia da última mensagem,
  horário e não-lidas. Exige dados que a tela não busca.
- Área do Professor e Painel de Controle mostram quase a mesma tela (dividem o
  `DashboardTab`) — dois destinos de menu para conteúdo sobreposto.

### Verificado no aparelho (13/08, pós-deploy)

Menu com só Notificações dourado · "Bom dia, DJ" (era "djmkbrasil") · Pendentes
com ícone neutro em zero · Conversas com "Visto há 1h/2h/3h…" por linha ·
Histórico **idêntico** ao de antes, provando que os alvos de 44pt entraram sem
mover pixel. A auditoria do Painel usou `role=admin` TEMPORÁRIO na conta de
teste (`djmkbrasil`), revertido para `teacher` na mesma sessão e conferido na
fonte.

## O CTA dourado tem DUAS formas — e a terceira é improviso (13/08/2026)

Medido, contando só `<button>`:

| forma | usos | o que é |
|---|---|---|
| `bg-yellow-500 text-black` | **184** | o CTA padrão do app |
| `.btn-gold-animated` | 19 | utility NOMEADA (gradiente animado, `gold-flow`) |
| `linear-gradient` inline | **29** em 22 arquivos | digitado à mão, sem nome e sem regra |

Os 19 não são problema: a utility está no `globals.css`, tem nome, e quem a usa
escolhe um comportamento — a animação puxa o olho para o momento de conversão
(entrar, salvar a primeira avaliação, criar o primeiro treino). **Use com
parcimônia: se tudo pulsa, nada pulsa.**

Os 29 são a mesma deriva das cores quase-gêmeas — não quebram nada hoje, e no
dia em que o dourado da marca mudar, ele muda em 184 lugares e continua velho
em 29. Congelados por teto por arquivo em `__tests__/ctaDouradoFormas.test.ts`,
que só desce. **Precisa de um tratamento novo? Vira utility com nome — improviso
não vira sistema.**

**Não foram reescritos de propósito:** trocar 29 gradientes por sólido mudaria o
visual de 29 botões em 22 telas de uma vez, sem ninguém olhando. Mesma escolha
do teto de 9px em texto corrido.

### A pergunta que originou isso, e a resposta que a medição deu

O dono perguntou se as abas (Avaliações, Comunidade, Nutrição, VIP) precisavam
ser padronizadas, e suspeitou que a **VIP** tivesse fundo e cards invertidos.
Medido: **a VIP é das mais alinhadas ao padrão** (eyebrow + título à esquerda,
grade 2×2). O que estava errado era o FUNDO DO SHELL por baixo de todas elas
(#171717 contra o #0a0a0a do body) — corrigido no #798. A relação card/fundo
nunca esteve invertida.

## A paleta REAL do app (medida em 13/08/2026, não a documentada)

Contagem por família em `src/`, para acabar com a discussão sobre o que "está
na paleta":

| família | usos | papel de facto |
|---|---|---|
| neutral | 5628 | texto e superfície — a base |
| yellow | 2507 | **a marca**: ação primária, destaque |
| red | 786 | erro, destrutivo **e curtida** (coração — convenção universal, 8 usos de `text-red-400`) |
| amber | 399 | irmã do yellow, usada de forma intercambiável |
| green | 317 | sucesso |
| emerald | 230 | **segundo verde, em 55 arquivos** |
| orange | 94 | alerta intermediário, macro gordura |
| violet | 25 | a cor da MÁQUINA (ver seção própria) |
| blue/sky/rose/teal/lime | < 15 cada | pontuais |

**`emerald` não estava na paleta documentada e tem 230 usos.** Não é deriva de
um componente: é família estabelecida. Antes de "corrigir" emerald para green
em algum lugar, saiba que criaria inconsistência com os outros 54 arquivos — a
nota é que estava desatualizada, não o código.

**O vermelho tem DOIS papéis legítimos**: erro/destrutivo e coração de curtida.
O segundo é convenção universal e o app já o segue. Não confundir com vermelho
decorativo, que é o que a tela de Configurações fazia e foi corrigido.

### Central de Notificações: 23 tipos, 7 famílias, zero critério

Diagnóstico de 13/08/2026, **não corrigido — exige decisão de taxonomia**:
`emerald` cobre Meta/Online/Marco/Refeição e `green` cobre Treino/Aceito/Aceito.
São cores distinguíveis (Δ=69), mas a distinção não codifica nada: não há regra
que explique por que "Meta" é de um verde e "Treino" de outro. É ruído com
aparência de sistema — pior que cores iguais, porque promete significado.

Ninguém memoriza 7 códigos de cor numa lista aberta uma vez por dia, e o
**rótulo textual já está no card** (PR, Streak, Meta, Treino…) fazendo o
trabalho. Se for mexer, agrupe por FUNÇÃO (conquista · atividade · social ·
aviso · neutro), não por tipo de evento.

## Paleta: a cor quase-gêmea é a que corrói em silêncio (12/08/2026)

Medido no produto (fora landing/marketing): **618 hex escritos à mão em 86 tons**
contra os 14 da paleta. Metade fora dela. O que importa não é o volume — é o
tipo: havia `#0f0f0f` contra o `#0f0f0e` oficial (Δ=1,7), `#141414` contra
`#151514` (Δ=2), `#1a1a1a` contra `#1a1a18` (Δ=3). O olho não resolve essa
diferença num fundo escuro: **alguém digitou de memória em vez de usar o token
que já existia**. Sete cores apareciam nas DUAS grafias (maiúscula e minúscula),
sinal de que ninguém copia de uma fonte única.

O custo não é estético: no dia em que o dourado da marca mudar, ele muda nos 14
lugares certos e continua velho nos outros 86.

As 28 invisíveis (Δ<12) viraram a cor oficial. Guard em
`__tests__/paletaSemGemeas.test.ts`, com distância ponderada de Riemersma —
trava só Δ<12, porque acima disso proximidade pode ser decisão de design, e
guard que opina sobre gosto é afrouxado na primeira semana. **Landing e
`/comercial` ficam fora**: têm identidade própria (o `#F5B800` de lá não é
deriva).

## Hierarquia tipográfica: 723 → 677 (12/08/2026)

Os 46 rótulos `text-xs font-black uppercase tracking-widest` que tinham COR
intencional (34 dourados) estavam presos no peso 900 porque `t-meta` embute
`color` — adotá-lo apagaria a cor. `t-meta-inherit` tem a mesma forma e não
opina sobre cor. **Tipografia e cor são decisões separadas**; misturá-las na
mesma utility foi o que travou o débito por uma semana.

Continua sendo o maior débito de design: **89% do texto do app em peso 700+**
(1430 `font-black` = 50%, 1098 `font-bold` = 39%, contra 279 de todos os pesos
intermediários somados). Quando tudo pesa 900, nada pesa — é o motivo de a tela
parecer flat com paleta e espaçamento bem resolvidos. O resto exige julgamento
tela a tela, não script.

## Raio: a regra escrita estava errada, não os 1400 usos (12/08/2026)

`rounded-xl` 1400 · `lg` 489 · `2xl` 447 · `full` 447 · `3xl` 52. A regra antiga
dizia "card = 2xl" e o app fazia outra coisa há tempos. Reescrever 1400 usos
para casar com a regra seria refazer a cara do app sem olhos conferindo — então
a **regra passou a descrever a prática** (documentada no `globals.css`), que é
coerente: o raio cresce com a superfície. 12 raios arbitrários viraram o degrau
mais próximo; só o `[2rem]` do hero do login ficou, por ser curva de arte.

**Espaçamento e motion estão SAUDÁVEIS** — medidos no mesmo dia, para ninguém
gastar auditoria: 13 ocorrências fora do grid de 4px em 350 arquivos, e 8
durações de transição concentradas em 300/200/150ms. Não são frentes.

## Violeta é a cor da MÁQUINA — `lib/design/machineAccent` (12/08/2026)

**Violeta = a máquina decidiu. Dourado = você decide.** Nada de violeta em
elemento que o usuário aciona; nada de dourado em valor que ele não escolheu.

A cor já existia em 21 lugares (9 arquivos) e, do lado do usuário, era **sempre**
saída de máquina: card CARGA AUTOMÁTICA, nota "🧠 Última vez…", campo de peso
sugerido, cartão de ajuste da avaliação por foto. Quatro superfícies que ninguém
combinou — o app convergiu sozinho. O defeito não era a cor: era ela existir **de
fato e não de direito**, replicada à mão com valores ligeiramente diferentes.

Ela é necessária: em âmbar, a sugestão do motor ficaria indistinguível do que o
usuário digitou; em cinza, viraria texto secundário que ninguém lê. Guard varre
`components/` e tem `NAO_E_A_COR_DA_MAQUINA` com o motivo de cada exceção
(paleta categórica de gráfico, anel de story, paleta oferecida ao usuário, tier
admin em tela administrativa).

## Piso tipográfico: 9px (12/08/2026)

142 usos de `text-[9px]` em 61 arquivos e **12 abaixo disso**, incluindo um
`text-[6px]` no círculo do timer de descanso. Dos 142, **95 são eyebrow label**
(maiúscula, `font-black`, tracking largo) — nessa forma 9px lê bem e é escolha
do design system; ficam. **Abaixo de 9px não há forma que salve**, e os 12
encontrados eram todos label: o argumento do tracking já estava no limite e
continuou encolhendo. Guard em `__tests__/corpoMinimoTexto.test.ts`.

**Débito conhecido:** 47 usos de 9px em texto CORRIDO (não label). Não corrigidos
porque subir 47 corpos muda layout em 47 lugares e isso não se entrega sem olhar
cada um.

## Contraste: `text-white/NN` escapava pela sintaxe (12/08/2026)

O guard proibia `neutral-500` (4.18:1) e **deixava passar `text-white/40`, que
mede 3.75:1** — pior, e só porque a regex olhava outra coisa. Eram 54 ocorrências
em 12 arquivos, todas texto real. Medido sobre `#0a0a0a`: `/40` = 3.75:1 ·
`/45` = 4.39:1 · `/50` = 5.15:1. **O piso é `/55`.** `hover:` fica de fora (estado
transitório, e no celular nem existe).

## Regra da hierarquia — um fato, um lugar (ago/2026)
**Antes de mexer em qualquer card que MOSTRE DADOS, leia `docs/DESIGN_HIERARCHY.md`.**

A regra em uma linha: **um fato aparece uma vez, cada bloco tem UM destaque, e o
destaque é o número acionável** ("faltam 97 g", não "111 g consumidos").

Ela nasceu porque o mesmo defeito apareceu **quatro vezes** na auditoria de
design de ago/2026 — barras de macro, heatmap, card de lançamento e hero de
calorias —, sempre com o dado duplicado ganhando MAIS peso que o original, e
sempre com o número que o usuário procura no menor tipo da tela. Não foi
descuido de ninguém: a regra não estava escrita, então cada card resolveu a
hierarquia por conta própria.

`src/__tests__/designHierarchyRatchet.test.ts` faz valer a parte mecânica
(imprimir como texto o percentual que o próprio componente desenha) e tem
`EXCECOES` que **só encolhe**. O resto é code review — as três perguntas estão
no doc. O guard NÃO acusa "mesmo valor duas vezes" de propósito: foi medido,
produz quase só falso positivo (`.map()`, `aria-valuetext`) e guard que grita no
lugar errado é afrouxado na primeira semana.

## "Deixe em 100%" é ordem de execução, não de consulta (23/08/2026)

**Quando o dono pedir 100%, ENTREGUE 100% — sem voltar para perguntar.**
Repreensão direta dele nesta data, e merecida: na varredura das áreas de
cálculo eu medi a cobertura, achei os buracos, fechei uma parte e **parei para
oferecer** o resto. Ele já tinha dito o que queria; perguntar de novo só
devolveu para ele um trabalho que era meu.

A fronteira, para não confundir com a regra de perguntar antes de presumir:

- **Não pergunte** quando o que falta é TRABALHO — escrever os testes que
  faltam, cobrir os ramos, varrer o arquivo seguinte. Isso é executar o pedido.
- **Pergunte** quando o que falta é uma DECISÃO que muda o produto e que só o
  dono pode tomar (foi o caso do protocolo das dobras: J&P7 com as dobras
  certas × trocar a equação × só corrigir o rótulo — três produtos diferentes).

E ao reportar, dê o NÚMERO, não a impressão: "97,6% de linhas, faltam os
caminhos com I/O" vale mais que "está bem coberto". Foi medindo que apareceram
os dois bugs desta auditoria — o protocolo das dobras e o streak em UTC.

## Varrer uma CLASSE: procure pelo símbolo E pela forma visual (27/08/2026)

Os dois ângulos acham conjuntos DIFERENTES, e cada um deixou passar o que o
outro pegou — medido varrendo as telas de erro que despejavam a exceção crua:

- Procurar pelo **símbolo** (`getErrorMessage(error)`) deixou passar o
  `dashboard/error.tsx`, que escrevia `{String(errorMessage || error?.toString?.() || …)}`.
- Procurar pela **forma visual** (`font-mono text-xs break-all`, a assinatura do
  painel vermelho) achou aquele — e deixou passar o SEGUNDO painel do
  `SectionErrorBoundary`, que usava `truncate` em vez de `break-all`.

Foram 11 superfícies no total; nenhuma busca sozinha teria fechado. **Ao varrer
classe, liste os dois: o que o código CHAMA e o que o defeito PARECE.**

E o corolário, que custou três tentativas na mesma sessão: a forma visual serve
para ENCONTRAR, não para virar guard permanente. Ver o jeito nº 8 da lista de
guards falsos.

## Padrão de auditoria (obrigatório fechar com testes)
**Regra fixa do dono: SEMPRE mirar 100% de cobertura.** Uma auditoria só está concluída quando TODA superfície relacionada foi varrida — inclusive as "menores" (buckets de storage, uploads de avatar/foto, onboarding/access-request, crons, etc.). Nunca deixar uma superfície "de raspão" ou "não abri a fundo": ou varre e confirma sólida, ou reporta o achado. Não encerrar dizendo "falta varrer X" — varrer X.

Toda auditoria de uma área NÃO está concluída sem verificar a cobertura de testes e **adicionar guards de regressão** — as brechas/bugs achados viram teste, senão voltam. Fluxo padrão:
1. **Verificar/mapear os testes existentes** da área antes de mexer (o que já cobre, o que não cobre).
2. **Confirmar cada achado por conta própria** antes de tratar como real (ex.: RLS via SQL no banco, não só leitura de código).
3. **Corrigir via TDD** onde couber: escrever o teste que FALHA no código atual (prova o bug) → corrigir → verde.
4. **Travar com teste** no padrão do repo, escolhido por tipo:
   - **função pura** (import real) — matemática/lógica isolada;
   - **mock de Supabase** encadeável (modelo `src/utils/__tests__/authRole.test.ts`) — resolução/metering/handlers;
   - **source-guard** (lê o `.ts` como texto e assegura o padrão, modelo `src/utils/vip/__tests__/appSubscriptionExpiry.test.ts`) — invariantes de query/migration difíceis de exercitar.
5. **Reportar a contagem antes/depois** de arquivos e casos de teste.

## Scripts de scan
`npm run scan:all` roda todos (buttons/secrets/a11y/console/async). **Rodar `npm run scan:secrets` antes de qualquer commit que toque em `.env` ou configs.**

## Comandos-chave
`npm run dev` (localhost:3000) · `npm run build` · `npm run analyze` (bundle) · `npm run deploy` = typecheck + commit + push → Vercel. Demais (`test:coverage`, `e2e`, `e2e:ui`, etc.) no `package.json`.

## Capacitor (mobile)
- **Após qualquer mudança em plugin nativo:** `npm run cap:sync` (web → iOS + Android) obrigatório. IDEs: `cap:open` / `cap:open:android`.
- **Push notifications:** nunca modificar sem testar em device físico real.
- **App ID:** `com.irontracks.app`. **Web dir do Capacitor:** `out/` (gerado por `next build`).

## Acessibilidade — o que dá e o que NÃO dá para verificar aqui (11/08/2026)

**O VoiceOver NÃO EXISTE no Simulador.** Não é configuração: escrever
`VoiceOverTouchEnabled` via `simctl spawn … defaults write` e reiniciar o
SpringBoard não liga nada, e a prova está na própria tela de Ajustes →
Acessibilidade do simulador — a seção "Visão" oferece Texto sob Cursor, Tela e
Tamanho do Texto, Movimento e Conteúdo Falado, e **VoiceOver não está na lista**
(num iPhone real é o primeiro item). Não gaste tempo tentando de novo.

**O que dá para auditar, e é bastante:**
- **Contraste** — medido pela fórmula do WCAG sobre `#0a0a0a`. Guard em
  `src/__tests__/contrasteTextoMinimo.test.ts` (faixas 500/700/800 proibidas).
- **Nome de controle** — botão só de ícone precisa de `aria-label`. Guard em
  `src/__tests__/botaoComNomeAcessivel.test.ts`. ⚠️ O parser desse guard anda
  caractere a caractere de propósito: `<button([^>]*)>` PARA no `>` do `=>` de
  arrow function e deixa passar todo botão com handler inline — foi assim que a
  primeira versão dizia verde com 10 botões mudos.
- **Estado de disclosure** — `aria-expanded` ligado ao estado, nunca a literal.
- **Árvore de acessibilidade das telas PÚBLICAS** — o app é web, então o
  `read_page` do navegador devolve exatamente o que o leitor de tela consome
  (nome, papel, ordem). Login e cadastro foram auditados assim e estão corretos.

**O que continua SEM verificação, e por quê:** ordem de foco, agrupamento (um
card lê como uma coisa ou como oito fragmentos?) e anúncio de estado nas telas
LOGADAS. A árvore do navegador resolveria, mas exige sessão — e o agente não
digita senha. Os dois caminhos que restam são o **Accessibility Inspector** do
Xcode (app de GUI, precisa de controle de tela autorizado pelo dono) ou o **dono
testando no iPhone dele**. Pedido de acesso ao Inspector foi negado em
11/08/2026; a lacuna segue aberta.

**Regra que vale para tudo aqui:** atributo de acessibilidade ERRADO é pior que
ausente — o leitor de tela anuncia com confiança uma informação falsa, e o
usuário não tem como conferir. Na auditoria de ago/2026 isso quase aconteceu
três vezes (rótulo por palpite em botão com texto dinâmico, `aria-expanded` em
botão que abre modal, guard com regex furado). Corrija só o inequívoco e
**reporte o resto em vez de silenciar**.

## ⚠️ NUNCA mandar print/screenshot ao dono (regra dele, 15/08/2026)

Pedido explícito, repetido duas vezes na mesma sessão: **não tirar screenshot
para mostrar, não anexar imagem na resposta.** Screenshot segue valendo como
FERRAMENTA de verificação do agente (ver a tela para decidir o próximo toque),
mas o resultado se relata em TEXTO — número do banco, estado do elemento, o que
funcionou. Imagem é o input mais caro que existe e o dono não quer recebê-la.

## Percorrer o app inteiro acha o que a suíte verde não acha (15/08/2026)

Teste de 10 passos pedido pelo dono (abrir → treinar → editar no meio → sair →
voltar → deletar → adicionar → métodos avançados → respeitar TODOS os descansos
→ finalizar), rodado no simulador de ponta a ponta. A suíte estava 100% verde e
mesmo assim o passo 10 **travou**: com o descanso rolando, a barra do
`RestTimerOverlay` cobria o `WorkoutFooter` e o botão **Finalizar era
inalcançável** — para terminar o treino era preciso esperar ou pular o descanso.

**A lição que dói: eu tinha "corrigido" essa MESMA classe no dia anterior.** O
PR #833 portou os 19 overlays de modal para cima da barra, e escrevi um guard —
que varria só os três arquivos de modais. O rodapé principal, que sofre do
mesmo defeito pelo mesmo motivo, ficou de fora, e o guard passou verde com o bug
vivo. **Guard que varre a lista dos arquivos que eu já conhecia não é guard de
classe: é guard da instância com cara de classe.** A pergunta certa ao escrever
guard continua sendo "onde ele NÃO olha?".

**Sobreposição no rodapé não se resolve com z-index.** Modal versus barra: dá
para empilhar em z (o modal cobre a tela toda, a barra fica atrás). Duas BARRAS
de rodapé disputam o mesmo espaço físico — quem estiver por cima esconde a
outra, qualquer que seja o z. A saída é geométrica: o `RestTimerOverlay` publica
a altura real da sua barra em `--it-rest-bar-h` (medida por `ResizeObserver`,
porque ela muda com safe-area e com o botão AUTO) e o `WorkoutFooter` posiciona
`bottom` por essa variável, com fallback `0px`. Guard em
`__tests__/rodapeAcimaDoDescanso.test.ts`; **barra fixa NOVA no rodapé do treino
ativo reprova em `barrasDoRodapeTreino.test.ts` até declarar como convive com o
descanso.**

**jsdom não tem `ResizeObserver`** — usar direto derrubou 3 testes de cardio e,
no aparelho, seria a tela inteira do descanso caindo. API de browser moderna em
componente sempre com `typeof X !== 'undefined'`; a medição inicial já cobre o
caso comum e o observer é só para mudança em voo.

**Prove por mutação com `npm run mutar` — não à mão.**

```bash
npm run mutar -- src/lib/x.ts "a >= b" "a > b" -- npx vitest run src/lib/__tests__/x.test.ts
```

Ele aplica, roda, **restaura do conteúdo** e exige vermelho. As três armadilhas
do jeito manual somem por construção, e as três já morderam aqui:

1. **`git checkout` apaga trabalho não commitado.** Aconteceu em 15/08, de novo
   em 25/08 — com a regra escrita neste arquivo — e **três vezes em 27/08**. O
   sintoma engana: os testes seguintes passam VERDES (o import quebrado derruba
   outra coisa, ou a mutação nem chega a existir) e você conclui "provado" sobre
   um arquivo que voltou no tempo. O script restaura da CÓPIA em memória, então
   rascunho não commitado sobrevive.
2. **A mutação pode não ser aplicada.** Um `sed`/`replace` que não casa devolve
   o arquivo intacto, o teste passa, e "provado por mutação" vira mentira em
   silêncio — em 25/08 duas mutações morreram em erro de aspas e o "14 passed"
   parecia prova. O script confere a substituição ANTES de rodar e aborta.
3. **Verde com o bug reposto não gritava.** Agora é saída 1 com "GUARD FALSO: o
   teste passou COM a mutação aplicada" — e a regra que segue é a de sempre:
   corrija o TESTE, nunca o afrouxe.

Que ler não bastava, ficou provado: a nota anterior *avisava* sobre o `git
checkout` e a armadilha pegou o autor do aviso três vezes num dia. Decisões em
`decidirAplicar`/`interpretarResultado`, travadas em `src/__tests__/mutarDecide.test.ts`.

**Automação do simulador — o que custou toque errado:** as coordenadas são
PONTOS (440×956 no 17 Pro Max), não pixels do screenshot; um toque convertido de
px caiu no botão "Duplicar" e criou exercício fantasma no rascunho.
**O screenshot vem em ~920×1963 px, então o fator é ÷2,09** — ler a coordenada
na imagem e enviá-la crua é o erro natural, e ele é SILENCIOSO: um `x` acima de
440 está fora da tela e mesmo assim a ferramenta responde `Tapped at (460, 706)`
com sucesso. Em 27/08/2026 isso consumiu uma investigação inteira ("o WebView
parou de aceitar toque"), com o app, a janela do Simulator e o device
interrogados e inocentados nessa ordem, **com esta regra já escrita aqui**.
Diagnóstico em 5 segundos: toque aceito e tela idêntica ⇒ confira se `x < 440`
antes de suspeitar de qualquer outra coisa. O backspace
(`\b`) NÃO chega ao campo: para limpar, long-press no texto → o iOS seleciona →
digitar substitui. E a autocorreção do iOS renomeia o que você digita ("Drop
teste" virou "Frio teste", "Bi A" virou "Vi A") — nomes de teste devem ser
palavras que o corretor não toca, senão a conferência por nome falha.

**O que o app fez CERTO no teste** (não reinvestigar como se fosse bug):
recusou concluir Drop-set com uma etapa só ("defina pelo menos 2") e Cluster com
bloco vazio; preservou sessão, edição e cronômetro ao sair e voltar; perguntou
"só hoje / pra sempre" ao deletar exercício; e sobreviveu a uma pausa de horas
no meio do treino sem perder log nem tempo.

**Achado de UX que ficou aberto (não é bug):** nos campos numéricos do editor
(Sets/Reps/RPE), digitar INSERE no cursor em vez de substituir — "2" com "1"
digitado vira "12". Contorno: long-press → selecionar → digitar. A correção
seria selecionar o conteúdo ao focar.

## As 4 correções de UX do teste de 10 passos (16/08/2026)

O teste manual gerou quatro frentes. **Três delas mudaram de diagnóstico ao ler
o código** — vale mais como método do que como changelog.

### Sessão esquecida: o defeito NÃO era o tempo inflar

Meu diagnóstico inicial ("o treino contou 616:03 e ninguém perguntou nada")
estava errado na causa. O tempo já tinha DUAS defesas —
`computeRecoveryPauseMs` no mount e o listener de `visibilitychange`, ambos
descontando gap acima de `LONG_GAP_MS` (20 min), escritos por causa de um "bug
do treino de 4h" anterior. **Não reimplementar isso.**

A lacuna real era outra e mais séria: **o `localStorage` não expirava NADA**,
enquanto o IndexedDB — a outra metade do mesmo snapshot — expira em 24 h
(`MAX_SESSION_AGE_MS`). E é o `localStorage` quem manda o app abrir no treino:
`useLocalPersistence` decide a view, `useSessionSync` hidrata. Resultado: treino
aberto na segunda reabre o app dentro dele na quarta, em silêncio; finalizar
dali grava a sessão de segunda com a data de hoje, e a **duração alimenta a
estimativa de calorias** (`getEpocFactor`), então o número falso chega ao
relatório, ao PDF e à Nutrição.

Hoje toda restauração passa por `lib/workout/restoreSessionGate.ts`, usado pelos
DOIS hooks — com a regra escrita só num deles, o outro discordaria e a view
abriria num treino que o estado recusou hidratar. Faixas: `fresh` (< 4 h),
`stale` (4–24 h, avisa), `expired` (> 24 h, descarta). A idade é da **última
atividade**, não da duração: quem treina 3 h com atividade recente segue fresh.
Na dúvida (sem carimbo, relógio para trás, `savedAt` corrompido) o veredito é
`fresh` — perder série registrada é irreversível, retomar sessão velha é só
incômodo. Um guard cobra que os dois armazenamentos expirem no MESMO prazo,
que é exatamente a divergência que causou o bug.

**Polaridade de diálogo destrutivo:** o `confirm` resolve `false` ao fechar por
fora, então DESCARTAR é o `confirmText` (destrutivo) e continuar é o caminho do
`false`. Invertido, um toque fora do modal apagaria as séries de um treino em
andamento. Mesma lição já aprendida no rodapé do treino.

### Autocorreção: o app tinha ZERO proteção, e a lista manual estava incompleta

O teclado do iOS renomeia o que você digita — "Drop teste" virou "Frio teste",
"Bi A" virou "Vi A" — porque nome de exercício não é palavra de dicionário. O
app inteiro tinha **zero `autoCorrect`** e dois `spellCheck` soltos.

Fonte única em `utils/ui/textFieldProps.ts` (nome próprio · código ·
identificador sem forma de palavra), hoje em 49 campos. **A fronteira é
IDENTIFICADOR × TEXTO LIVRE**: em notas, chat e descrição a autocorreção AJUDA,
e o guard cobra os dois sentidos — identificador sem proteção reprova, e texto
livre COM proteção também.

Duas lições de método aqui:
1. **Um subagente varreu e devolveu 38 campos; o guard achou 16 que ele
   perdeu** — e um dos 38 estava errado (casou com uma mensagem de erro, não
   com um input). Resultado de subagente é insumo, não verdade.
2. **Componente genérico não recebe a decisão.** O `EditField` do
   `VoiceWorkoutModal` serve o nome do exercício E o campo Notas; aplicar nele
   desligaria o corretor justamente onde ele ajuda. A marca foi para a CHAMADA.

### Descanso sem teto e conferência de carga

O contador de "além do planejado" chegava a **"+286:32"** em verde, ocupando o
rodapé (e empurrando o `WorkoutFooter` por `--it-rest-bar-h`). Agora desiste aos
15 min de extra, pelo `onFinish` — que encerra SEM avançar série. **Cardio e
prancha ficam de fora**: são timers de EXERCÍCIO, e encerrar uma corrida de
40 min apagaria uma medição em andamento.

A conferência de carga (`lib/workout/weightOutlier.ts`) entra no resumo que a
finalização já mostra, **de propósito**: cobre os 14 métodos de série sem tocar
em nenhum renderer. Fator 4×, folgado — progressão real anda em 2,5–10% e o
autoload trava em +10%, enquanto erro de digitação dá fator 5 a 10. Limiar
apertado vira ruído, e aviso que aparece à toa é ignorado inclusive quando está
certo.

**A referência é MEDIANA, e isso é o ponto do módulo.** Com o ÚLTIMO valor, um
200 digitado errado na sessão passada faria o 200 de hoje parecer normal — o
detector ficaria cego logo após o primeiro erro. A média sofre do mesmo mal, e o
teste mede: 200 ÷ média 80,5 = 2,48, abaixo do limiar, o erro passaria.

### ⚠️ O cronômetro do simulador CONGELA quando a janela perde o foco

Custou 25 minutos de espera inútil e quase virou um "o teto não funciona".

Ao tentar provar o teto de 15 min do descanso no aparelho, o contador andou
**25 segundos em 8 minutos reais** — o ticker do WebView é estrangulado quando a
janela do Simulator não está em foco no macOS. Nesse ritmo, esperar os 15 min do
produto levaria mais de meia hora de relógio de parede.

**Consequência prática:** qualquer invariante que dependa de TEMPO PASSAR
(timeout, teto, expiração, auto-avanço) é impraticável de verificar por espera no
simulador. Prove por teste + mutação e diga que a prova foi de código, não de
tela — e não conclua "não funcionou" a partir de um contador que parece parado.

O que É verificável no simulador continua sendo o de sempre: o que reage a TOQUE
e a DIGITAÇÃO. A autocorreção, por exemplo, se prova em 30 segundos — digitar
"Bi A Drop teste" num campo de nome e ler o que ficou lá.

### O que ficou provado ONDE (não misturar as duas coisas)

| correção | prova |
|---|---|
| autocorreção do teclado | **no aparelho** (texto digitado ficou intacto; no dia anterior virava "Vi A"/"Frio teste") + render + guard de classe |
| sessão esquecida | teste + mutação (3 mutações, todas vermelhas) |
| teto do descanso | teste + mutação — **prova de tela não fechada**, ver o congelamento acima |
| conferência de carga | teste + mutação |

### Mutação INVÁLIDA não prova guard fraco

Ao provar o teste de render dos atributos de teclado, a primeira mutação
(`autoCorrect` → `autocorrect`) **não derrubou o teste — e estava certo**: o
React 19 normaliza os dois spellings para o mesmo atributo HTML, então não havia
bug a introduzir. A mutação válida é REMOVER o atributo (derruba 3 de 4 casos).

Antes de afrouxar um guard que "não pegou a mutação", confira se a mutação
representa um defeito real. Guard que não falha com bug presente é guard falso;
guard que não falha com uma mudança inócua está apenas correto.

### Três erros meus que o ferramental pegou

Registrados porque vão se repetir:

1. **Hook depois de early return.** O efeito do teto entrou abaixo de
   `if (!targetTime || dismissed) return null` — o ESLint travou, e um teste de
   cardio já estava vermelho por isso. Componente grande esconde onde termina a
   região dos hooks.
2. **Guard fatiado a partir do IMPORT.** `indexOf('shouldAbandonRest')` casa
   primeiro com a linha de import e arrasta o arquivo inteiro para dentro do
   bloco medido — o guard passou a medir o `handleStart`, que legitimamente usa
   `onStartRef`. Fatie pela CHAMADA (`/nome\s*\(\s*\{/`), nunca pelo nome solto.
3. **Busca por `find` da primeira ocorrência.** Aplicar props procurando o
   placeholder pegou uma string de mensagem de erro em vez do input. Ao editar
   em massa, confira CADA ponto pelo que ele é, não pela primeira coincidência —
   e feche com `next build`, que é o que de fato prova JSX íntegro.

## Que modelo roda o teste exploratório no simulador (16/08/2026)

**Opus** — e não pela execução. Tocar, digitar e capturar tela qualquer modelo
faz; o valor do teste de 10 passos esteve inteiro no JULGAMENTO.

Nenhum dos três defeitos achados estava no roteiro. O passo 10 dizia "finalize o
treino"; o botão não respondeu, e a decisão seguinte era **dar como feito ou
desconfiar**. Os outros dois momentos que exigiram o mesmo: reconhecer que o
guard escrito no dia ANTERIOR era falso (varria só os arquivos já conhecidos), e
distinguir bug de acerto — o app recusou concluir Drop-set com uma etapa só, o
que parece falha e é comportamento correto; reportar isso custaria uma
investigação atrás de fantasma.

- **Sonnet** dá conta de regressão com roteiro fechado e critério objetivo
  ("toque aqui, confirme que aparece X"). O que ele tende a não fazer é o passo
  lateral, parar num "isto está estranho" que ninguém mandou procurar.
- **Haiku não**, para este caso: coordenada espacial lida de imagem, sessão longa
  com estado acumulado e decisão visual a cada passo.
- **Ressalva honesta:** isto é julgamento sobre a natureza da tarefa, não
  medição — o mesmo roteiro não foi rodado em Sonnet para comparar.

**Não repita o roteiro antigo com modelo nenhum.** Os três bugs daquele teste já
são Playwright no CI (26 s, a cada PR). O que ainda paga Opus é EXPLORAR caminho
novo: tela nunca percorrida, fluxo que mudou, método de série que ninguém rodou
de ponta a ponta. Exploração acha o que 5.582 testes verdes não acham — foi
literalmente o que aconteceu.

**O que encarece não é o modelo, é a foto.** Screenshot é o input mais caro que
existe; capturar só nos pontos de decisão corta a maior parte da conta.

## Cobertura de teste: o que roda no CI hoje (15/08/2026)

O teste manual de 10 passos passou por cima de **5.476 testes verdes** (hoje
5.582) e ainda
achou três defeitos — porque nenhum deles ANDAVA pelo app. Estado atual, para
ninguém remedir:

| camada | roda no CI? | o que cobre |
|---|---|---|
| Vitest unit/integração (5,6k) | **sim** | lógica, contratos, guards de classe |
| Vitest de jornada (jsdom) | **sim** | contrato entre componentes (ex.: `jornadaDescansoRodape` — o descanso publica `--it-rest-bar-h`, o rodapé consome, some ao desmontar) |
| Playwright público (29 testes) | **sim, desde 15/08** | páginas públicas carregam, protegidas redirecionam sem 500, árvore de acessibilidade íntegra |
| Playwright autenticado (jornada, 4 testes) | **sim, desde 16/08** | percorre treino real em viewport mobile contra o preview da Vercel, sem expor chaves privadas de servidor |
| `visual-regression` | **não, de propósito** | screenshot entre máquinas diferentes é flake por construção |

**A jornada logada de UI já tem spec** (`e2e/authenticated-workout-journey.spec.ts`,
15/08/2026): concluir série com o FINALIZAR alcançável durante o descanso,
renomear no editor completo sem perder o foco, campo numérico substituindo, e
sair/voltar preservando a sessão. O job do CI aponta para o **preview da Vercel
do PR**, porque ali o dashboard já tem as variáveis privadas de servidor sem
expor `SUPABASE_SERVICE_ROLE_KEY` ao repositório público. O gate exige as
credenciais da conta de teste e `VERCEL_AUTOMATION_BYPASS_SECRET`. Os cinco
secrets necessários estão configurados no GitHub. A primeira execução limpa foi
o run `31926932133`: preview encontrado, **4/4 testes em 26,1 s**, sem retry nem
flake. Continua fora: sanear `admin-protection` e `critical-api`, que falham por
ambiente.

### Escrever E2E de UI: cinco jeitos de passar VERDE com o bug presente

Todos medidos ao escrever aquele spec — cada um passou verde com o defeito
reposto antes de o teste ser corrigido:

1. **Viewport errada.** A barra do descanso é centralizada (`max-w-md`); em
   tela larga ela não cobre o FINALIZAR e o caso passa. O app é mobile —
   `test.use({ viewport: { width: 390, height: 844 } })`.
2. **Superfície errada.** O bug do teclado era no EDITOR COMPLETO e só em
   exercício ADICIONADO na hora: exercício salvo tem `id` e a key já é estável;
   no modal rápido de exercício o defeito nunca existiu.
3. **Asserção que o framework conserta.** Conferir o VALOR digitado não pega
   remount: o Playwright re-resolve o locator a cada tecla e o estado do React
   repõe o texto. O que não sobrevive é a IDENTIDADE do nó
   (`elementHandle` + `isConnected`).
4. **`hover` no lugar de `click({ trial: true })`.** Hover move o mouse sem
   exigir que o alvo receba o ponteiro — passa com outro elemento por cima.
   O trial click roda todas as checagens de actionability sem clicar.
5. **Estado que o teste mesmo criou.** Clicar num campo que já está focado não
   dispara `focusin`; o caso do select-on-focus media um cenário inexistente
   até o teste tirar o foco antes.

### ⚠️ A sessão de treino ativa é SINCRONIZADA PELO SERVIDOR — e o E2E divide a conta

Custou um CI vermelho num PR que só mexia em `.md`, e o diagnóstico começou
errado duas vezes.

`active_workout_sessions` (tabela, com `state` jsonb) guarda a sessão em
andamento **no servidor**, para o treino continuar de outro aparelho. Ou seja:
ela **sobrevive entre execuções do CI** e é compartilhada por TODOS os clientes
logados na conta de teste — inclusive um simulador esquecido aberto.

Foi o que houve em 16/08/2026: deixei o app aberto no simulador com
`djmkbrasil`, ele seguiu reescrevendo essa linha por horas, e cada escrita
voltava por **realtime** para o navegador do CI. O `fill('42')` do Playwright
era desfeito pelo estado remoto (o teste esperava `42` e encontrava `40`, o
peso da minha tela) e o re-render constante impedia o botão "Voltar" de ficar
`stable` — o caso morria em `locator.click: Test timeout`.

**Nada disso era bug do app**: é o sync multi-dispositivo funcionando como
projetado. Era contaminação de ambiente.

Duas hipóteses minhas que a verificação derrubou, nesta ordem — as duas
plausíveis, as duas erradas:
1. "É a documentação" — não, o step que falhou foi o E2E logado.
2. "A sessão do simulador vive só no armazenamento local, não alcança o CI" —
   **falso**, e é justamente o ponto: ela vai para o banco.

Só a consulta ao `active_workout_sessions` (com `state->'logs'`) fechou o caso:
o log `0-1` com peso 84 era, literalmente, o que estava na minha tela.

**O que fica:**
- **Isso é AUTOMÁTICO desde 25/08/2026** (pedido do dono): `npm run sim:close`
  (`scripts/sim-close-workout.mjs`) encerra o app em todo simulador ligado e
  apaga a sessão ativa da conta de TESTE. Ele roda sozinho como hook `Stop`
  — ou seja, ao fim de cada resposta —, configurado em `.claude/settings.json`.
  ⚠️ **O `.claude/` está no `.gitignore`**, então o hook é local desta máquina:
  em outro clone existe o script mas não o gatilho. O `user_id` é literal e a
  conta oficial (`djmkapple`) é conferida e recusada; nada mais no banco é
  tocado (medido: apagou 1 linha da conta de teste e preservou as 4 de
  usuários reais).

  ⚠️ **Ele NUNCA tinha limpado o banco rodando de um worktree** — corrigido em
  27/08/2026. O script lia `.env.local` ao lado de si mesmo, e worktree não tem
  esse arquivo (está no `.gitignore`, não é copiado): `lerEnv` voltava vazio e a
  função saía com `return null` **em silêncio**. Como este repo trabalha em
  worktrees, o hook rodava a cada resposta sem fazer nada. Só apareceu quando
  uma órfã de 33 min derrubou o E2E de um PR que só mexia em `.md`. Hoje ele
  procura também na raiz do checkout principal (`git rev-parse
  --git-common-dir`) e AVISA quando não acha credencial, em vez de sair mudo.

  Duas portas para mexer no banco: **simulador ligado** (encerra o app e limpa)
  ou **sessão da conta de teste parada há mais de 30 min**, mesmo sem simulador
  — porque desligar o simulador depois de abrir um treino deixava a órfã para
  sempre. A segunda porta é segura porque olha só a conta de TESTE e exige tempo
  parado: treino real com pausa longa acontece na conta OFICIAL, que o script
  recusa.
- Ao terminar de mexer no simulador com a conta de teste, **encerre o app** —
  app aberto continua escrevendo. E confira a tabela:
  ```sql
  select started_at, updated_at, (state->'logs'->'0-0'->>'weight') as peso_s1
  from active_workout_sessions
  where user_id = '6cb619ba-1484-41f2-b60c-b67aaea06307';
  ```
- O spec da jornada agora **DESCARTA** a sessão preexistente em vez de
  reaproveitá-la. Reaproveitar herda logs que o teste não escreveu — o caso
  deixa de medir o que diz medir.
- Regra geral: **teste E2E que divide conta com gente de verdade precisa partir
  de estado que ele mesmo criou.** Estado herdado é flake com cara de bug.
- **O sintoma nem sempre aparece dentro do treino.** Em 22/08/2026 a jornada
  morreu no `INICIAR TREINO` do DASHBOARD, com `element is not stable` — o
  botão não parava de se mover, porque o estado remoto seguia chegando e
  re-renderizando. Parecia regressão do PR (que mexia em renderers de série) e
  não era: o clique nem chegava perto do código alterado. **Antes de investigar
  o diff, re-rode o job**; passou de primeira no rerun, sem tocar em nada.
- **O CONCORRENTE nem sempre é humano — pode ser o outro run do seu próprio PR
  (24/08/2026, PR #910).** O #909 falhou com "a lista de treinos precisa ter ao
  menos um card" e o rerun passou. Não era flake sem causa: **nenhum workflow
  do repo declarava `concurrency`**, então dois commits da MESMA branch com 2
  minutos de diferença geravam dois runs vivos ao mesmo tempo. Medido com
  precisão de segundos — o E2E do run que passou ocupou 16:37:42→16:38:11 e o
  do que falhou 16:37:54→16:40:13, **17 s de sobreposição**, com a sessão ativa
  nascendo às 16:37:58, dentro deles. Um run chamava `descartarSessao()` na
  sessão que o outro tinha acabado de abrir.

  Hoje o `ci.yml` tem `concurrency` + `cancel-in-progress: true` (o run
  obsoleto morre) e o describe da jornada tem `mode: 'default'` — sem ele,
  `fullyParallel: true` com `workers: 2` punha dois dos quatro casos em voo na
  mesma conta. **`'default'` e não `'serial'`**: os dois rodam em ordem num
  worker só, mas o `serial` PULA os casos seguintes quando um falha, e
  esconderia um segundo defeito atrás do primeiro. Guard de classe em
  `src/__tests__/e2eContaCompartilhada.test.ts` — spec NOVO que abra sessão de
  treino reprova até declarar o modo.

  **A correção foi provada no mundo real, não só por guard:** dois pushes na
  mesma branch com 28 s de diferença, e o run anterior apareceu `cancelled`.

- **A sessão órfã é a causa MAIS COMUM de "a lista de treinos precisa ter ao
  menos um card" — e ela não é do PR (26/08/2026).** Aconteceu três vezes num
  dia (#937 duas vezes, #940 uma), e nas três a investigação começou pelo diff
  do PR, que não tinha nada a ver. Um deles chegou a ser DIVIDIDO em dois para
  bisseccionar um culpado que não existia — e a metade separada passou.

  O mecanismo: a limpeza (`descartarSessao`) é feita pela UI, e é justamente
  quando um caso FALHA que a página fica no estado que o derrubou (modal
  aberto, hidratação pela metade, botão que não estabiliza). O descarte tem
  menos chance de funcionar exatamente quando é mais necessário, a linha de
  `active_workout_sessions` fica no servidor, e o PRÓXIMO run abre o app DENTRO
  de um treino — sem card nenhum no dashboard.

  **Antes de olhar o diff, consulte a tabela.** Se houver linha parada há mais
  de alguns minutos, é resíduo: apague e re-rode.

  ```sql
  select started_at, updated_at, now() from active_workout_sessions
  where user_id = '6cb619ba-1484-41f2-b60c-b67aaea06307';
  ```

  Hoje o spec **avisa** quando não conseguiu descartar (o `.catch(() => {})` que
  embrulhava isso tornava a órfã invisível) e tenta uma última vez no
  `afterAll`, com PÁGINA NOVA — fora do estado que derrubou o caso. Guard em
  `src/__tests__/e2eLimpaSessaoAtiva.test.ts`. O que ele trava não é "a limpeza
  funciona" (depende da UI, e o teste não garante), e sim que ela **não falha
  em silêncio**.

  ⚠️ **Fica um risco residual conhecido:** `concurrency` agrupa por `ref`, então
  dois PRs DIFERENTES rodando ao mesmo tempo ainda dividem a conta. Não foi
  tratado porque exigiria extrair o E2E logado para um job próprio com grupo
  global — e o histórico deste repo é de PRs sequenciais. Se voltar a falhar com
  dois PRs abertos em paralelo, é essa a correção, e o diagnóstico é o mesmo:
  compare as janelas dos steps de E2E com
  `gh api repos/.../actions/runs/<id>/attempts/1/jobs`.

### Armadilhas de ambiente (custaram mais que o spec)

- **A porta 3000 pode ter OUTRO projeto.** Com `reuseExistingServer`, o
  Playwright testa o app errado em silêncio — a suíte rodou inteira contra a
  tela de login de outro produto. Use `PLAYWRIGHT_PORT`.
- **`globalSetup` roda junto com a subida do servidor**: sem esperar o app
  responder, o login falha, o storage state não é criado e TODOS os testes
  autenticados morrem com `Error reading storage state`, que não diz a causa.
- **`secrets` NÃO existe em `if:` de step.** Usar ali derruba o workflow
  INTEIRO antes de rodar qualquer passo ("workflow file issue", run
  31918472665) — inclusive typecheck e testes. Leia para `env` no nível do job.
  Guard varre isso em `ciE2ePublicoLigado.test.ts`.
- **`npm run dev` não aguenta a suíte**: o app chega a mostrar "Não foi
  possível carregar o app" depois de algumas execuções. Rode contra o build
  (`CI=1 PLAYWRIGHT_CI_SERVER=1`), que é o que o CI faz.

**jsdom não tem `ResizeObserver`** — usar direto derrubou 3 testes de cardio e,
no aparelho, seria a tela inteira do descanso caindo. API de browser moderna em
componente sempre com `typeof X !== 'undefined'`.

## Campo numérico SELECIONA ao focar (15/08/2026)

Tocar num campo com valor e digitar INSERIA no cursor: com `2`, digitar `1`
virava `12` — carga errada gravada no histórico, que é a base que o motor de
carga automática lê depois. Hoje tocar seleciona o valor e digitar substitui.

Fonte única em `utils/ui/selectOnFocus.ts`. Três detalhes que a versão ingênua
erra no iOS: `requestAnimationFrame` (dentro do `onFocus` o WebKit ainda está
posicionando o cursor pelo toque, e o `select()` não pega), `setSelectionRange`
em vez de `select()` (mais confiável em `type="text"` com `inputMode` numérico —
e `type=number` está fora de questão, rejeita vírgula no pt-BR) e abortar se o
foco já saiu no frame seguinte.

**A cobertura é por DELEGAÇÃO de evento** (`installNumericSelectOnFocus`,
montada no shell do dashboard): são ~80 inputs numéricos escritos à mão nos
modais de método, e reescrever 80 JSX por regex é a operação que já colapsou 73
arquivos aqui. O alvo é o `inputMode` (decimal/numeric) — texto livre fica de
fora por construção. `NumericInput` e os campos de série (`useInputField`,
`selectOnFocus` **true por padrão**) também selecionam explicitamente; **notas**
é a exceção declarada. Opt-out por `data-no-select-on-focus`.

## Teste no simulador iOS (o agente verifica sozinho, não o dono)
**Regra fixa: o agente testa no simulador — não pede pro dono virar QA.**

**Caminho do editor de Story** (leva tempo achar às cegas): menu do avatar → **Histórico** → abrir um treino → botão **STORY** no topo. O ícone de compartilhar do card de treino é export PDF/JSON, não é o composer.

**⚠️ DUAS CONTAS, E CONFUNDI-LAS JÁ PRODUZIU UM BUG INEXISTENTE.** Confirmado com o
dono em 09/08/2026 — **o simulador está logado em `djmkbrasil@gmail.com`, a conta de
TESTE**. (Esta linha já afirmou o contrário; a conta do simulador MUDA, então trate
como pista datada e **confirme antes de comparar tela × banco**.)

**Reconfirmado em 10/08/2026, e some com a dúvida em 5 s:** o SIMULADOR mostrava 6
treinos A–F, "Complete seu perfil 20%" e meta 2000 kcal (= teste); no mesmo dia, o
print do IPHONE do dono trazia 2279/2676 kcal (= oficial). Ou seja: **simulador =
teste, aparelho do dono = oficial** — quando ele mandar um screenshot, ele NÃO é da
mesma conta que você está vendo.

**Escrever na conta de teste é LIBERADO — inclusive finalizar treino** (decisão do
dono, 11/08/2026: "djmkbrasil é só para testes"). A regra antiga mandava sempre
descartar; ela existia porque se acreditava que finalizar poluiria o histórico do
dono, e isso é falso — o histórico dele está na `djmkapple`. A trava custava as
telas que só existem DEPOIS do treino: relatório, PDF, story e o autoload
recalculando a carga. Nada disso era verificável.

Continua valendo, e não é detalhe:
- **A conta oficial (`djmkapple`) segue intocável.** Nenhuma escrita, nunca.
- **A conta de teste vive no banco de PRODUÇÃO**, então treino finalizado pode
  aparecer no feed da comunidade para usuários reais. Não é motivo para não
  finalizar; é motivo para não fazer 20 seguidos nem inventar PR absurdo.
- **Limpar depois continua sendo boa educação**, não obrigação: apagar a sessão de
  teste evita que o histórico da conta vire lixo e que o autoload aprenda de
  números inventados.

### A conta de teste foi ESPELHADA na oficial em 11/08/2026

Decisão do dono, para acabar com "o print dele mostra uma coisa e o simulador
outra". O que foi copiado de `djmkapple` → `djmkbrasil`:

| | Copiado? | Observação |
|---|---|---|
| Templates de treino | **sim** (5, 39 exercícios, 128 séries) | os 6 antigos (A–F) foram **arquivados**, não apagados |
| Sessões concluídas | **12 mais recentes** | o bastante para autoload/deload lerem histórico de verdade |
| Meta de nutrição | **sim** (2676 kcal) | |
| Perfil / objetivo / fase | **sim** | antropometria, `fitnessGoal`, `nutritionPhase`, `autoLoad`, `plateInventory` |
| Avaliações corporais + fotos | **não** | dado corporal e arquivos no storage; o ganho não paga |
| Resto do histórico (117 sessões) | **não** | 1,5 MB de JSON, e faria a conta de teste aparecer no **ranking e na comunidade** com 2,4 M kg falsos |
| Telefone, cidade, academia, notificações, feature flags | **não** | na época, `featureTeamworkV2` ligaria uma feature sem tabelas; hoje nem a flag existe (#436) nem a feature está desligada (#859) |

**Os IDs dos clones são determinísticos** — `md5(<id de origem> || ':clone-teste-v1')::uuid`.
Isso torna a cópia idempotente (rodar de novo não duplica) e o rollback exato:

```sql
-- desfaz o clone inteiro e devolve os templates A–F
with c as (select md5(id::text||':clone-teste-v1')::uuid nid from workouts
           where user_id='d04bfcef-54ea-4360-9e3d-e174a9ace503')
delete from workouts w where w.user_id='6cb619ba-1484-41f2-b60c-b67aaea06307'
  and w.id in (select nid from c);
update workouts set archived_at=null
 where user_id='6cb619ba-1484-41f2-b60c-b67aaea06307' and is_template;
```

**⚠️ O espelho ENVELHECE.** É uma foto de 11/08/2026, não uma sincronização: nada
mantém as duas contas iguais. Mudou treino ou meta na conta oficial depois dessa
data e elas divergem de novo — agora com cara de sincronizadas, que é pior.
**A regra de confirmar qual conta está na tela continua valendo**; o espelho só
reduz a frequência do problema.

| | `djmkbrasil` (TESTE, no simulador) | `djmkapple` (OFICIAL, o dono treina nela) |
|---|---|---|
| `user_id` | `6cb619ba-1484-41f2-b60c-b67aaea06307` | `d04bfcef-54ea-4360-9e3d-e174a9ace503` |
| Templates ativos | 5 (SEG/TER/QUA/QUI/SEX) + 6 arquivados | 5 (SEG/TER/QUA/QUI/SEX) |
| Sessões concluídas | **13** (12 clonadas + 1 vazia antiga) | **129** |
| Meta em `nutrition_goals` | 2676 kcal | 2676 kcal · P208 C295 G74 |
| Fase / perfil | CUT, perfil preenchido | CUT, perfil completo |

**Como identificar rápido, agora que as telas são parecidas:** a de teste tem o
chip **"ARQUIVADOS (6)"** na lista de treinos e um histórico de 13 sessões; a
oficial não tem arquivados e tem 129. O aviso "Complete seu perfil" **não serve
mais** — sumiu da conta de teste quando o perfil foi copiado. O peso do check-in
nunca serviu.

**O erro concreto, para não se repetir:** em 09/08/2026 um agente leu "0kg levantados"
e "Meta: 2000 kcal" na tela do simulador, consultou o banco de `djmkapple` (2,4 M kg,
2676 kcal) e concluiu que havia dois bugs graves. **Não havia nenhum**: a conta de teste
tem 1 sessão vazia e zero metas salvas, então os dois números estavam CERTOS. Custou uma
investigação inteira de RLS, RPC e policies atrás de fantasma. Ler a tela de uma conta
contra o banco de outra não é imprecisão — inverte a conclusão.

**A página `/dashboard/nutrition` NÃO é alcançável dentro do app nativo.** A aba NUTRIÇÃO do dashboard abre o `NutritionOverlay`, que é outro componente; o `VipHub` até tem `router.push('/dashboard/nutrition')`, mas só quando `onOpenNutrition` não é passado — e no dashboard ele é. A página é a superfície WEB. Mexeu nela? A conferência visual pelo simulador não existe: valide pelo overlay (irmão que exibe os mesmos números) ou pelos dados, e **diga que a prova foi numérica, não visual**.

**A suíte verde não vê o que só existe na TELA — dois casos em 27/08/2026, com
6.7 mil testes passando.** (1) A Central de Notificações ganhou navegação e os
cards continuavam inertes: o `.map()` que monta a lista reconstrói cada item
campo a campo e não copiava `metadata`, então o destino nunca era encontrado. A
lista fica IDÊNTICA — some só o clique. (2) A tela de login passou a exibir
"V6DC5E30D" no lugar de "v1.21", porque a correção deu precedência a
`NEXT_PUBLIC_APP_VERSION`, que na Vercel é o SHA do commit (é o buster de cache
do service worker, nunca a versão pública).

O padrão dos dois: **o guard media a ponta certa e a fiação errada** — o
componente isolado estava correto, o dado é que não chegava nele. Depois de
mexer em algo que aparece, abra a tela; e para o que a tela não alcança (a
página web da nutrição), diga que a prova foi numérica.

**Teste de canvas NÃO prova rendering.** jsdom não implementa `canvas.getContext('2d')`, então `measureText`/matrizes caem em fallback e o teste passa verde com o desenho quebrado. Foi assim que a legenda do Story subiu com 23 guards verdes e o texto invisível no aparelho. Em qualquer coisa que DESENHE, o guard cobre o algoritmo e a fiação; o resultado na tela é conferência visual — declare o limite no próprio arquivo de teste.

**REGRA DO DONO (03/08/2026): toda mudança que precise de verificação VISUAL termina
no simulador iOS — abrir, navegar até a tela e conferir com screenshot.** Não vale
entregar UI descrevendo o que deveria aparecer, nem substituir a conferência por
mock/teste de render (eles provam comportamento, não o resultado na tela). **Device
padrão: iPhone 17 Pro Max** — é o aparelho do dono; só usar outro se ele pedir.

**O simulador aponta para onde você mandar — inclusive o `npm run dev` (19/08/2026).**
`capacitor.config.ts` fixa `url: process.env.CAPACITOR_SERVER_URL || 'https://irontracks.com.br'`,
então o default continua sendo PRODUÇÃO. O que mudou é o custo de sair dele:

```bash
npm run dev          # servidor local na 3000 (deixe rodando)
npm run sim:local    # aponta o simulador para http://localhost:3000 e relança
npm run sim:prod     # devolve para produção ao terminar
npm run sim:status   # para onde está apontando agora
```

⚠️ **A porta 3000 desta máquina NÃO é necessariamente o IronTracks (27/08/2026).**
Medido: quem escuta `127.0.0.1:3000` é o `Instagram/mk-dashboard`, servido em
standalone — e ele **respawna sozinho** segundos depois de ser derrubado (tem
supervisor). Como o `npm run dev` daqui fixa `--port 3000`, os dois convivem em
pilhas diferentes (um em IPv4, outro em `[::1]`) e o simulador pode carregar o
app ERRADO sem nenhum aviso. Diagnóstico em duas linhas:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -p <pid> | awk '$4=="cwd"{print $NF}'
```

Saída: subir este repo em outra porta (`npx next dev --webpack --port 3010`) e
apontar o simulador para ela — **`sim:local` aceita porta ou URL inteira**:
`npm run sim:local 3010`.

`scripts/sim-server.mjs` reescreve o `server.url` do `capacitor.config.json` **dentro
do bundle já instalado** (o bundle do simulador é um diretório no disco do Mac, sem
assinatura para invalidar) e relança o app. Leva menos de um segundo: nada de
`cap sync`, `out/` ou Xcode. **Hot reload funciona** — editar um `.tsx` aparece na
tela do simulador em segundos, sem relançar (provado em 19/08 mudando um texto do
LoginScreen).

Isso muda o fluxo padrão: **verificação visual passa a ser ANTES do commit**. O
caminho antigo (mergear → esperar deploy → olhar) custava PR + CI + deploy por
rodada, e três correções seguidas de UI pagaram esse pedágio em 19/08.

Duas coisas para não tropeçar:
- **Em local você precisa LOGAR de novo.** `localhost:3000` é outra origem, então
  cookie e storage não vêm de produção. O agente não digita senha — quem loga é o
  dono, uma vez; a sessão fica no simulador enquanto ele estiver apontado para local.
- **Termine com `npm run sim:prod`.** Esquecer deixa o app preso no seu localhost:
  na próxima abertura, sem `npm run dev` no ar, ele não carrega.

Continua valendo: `.app` já instalado serve para qualquer mudança **web/JS** — só
código NATIVO (Swift/plugin) exige build nova. E, depois do merge, apontar para
produção segue sendo a conferência final.

⚠️ **O teclado do simulador corrige para o INGLÊS.** Medido em 25/08/2026:
"peixe grelhado com batata doce" virou "Price grew Haro com Batista doce" e
"cozido" virou "cozies". Some-se a isto que o campo de nome de refeição
capitaliza cada palavra. **Digitar texto livre em português no simulador não
prova nada** — para conferir a TELA, injete o dado na conta de teste por SQL;
para conferir o MODELO de IA, chame a API direto. (Campos de identificador do
app já desligam a autocorreção — ver `utils/ui/textFieldProps.ts`; o que sobra
são os de texto livre, onde ela ajuda no aparelho real.)

**Acesso ao device é concedido pelo dono**, uma vez por aparelho, no link
"Let Claude use it" do painel. Se `attach`/`launch` responder que falta permissão,
peça — não fique tentando em loop.

**O caminho do bundle MUDA a cada launch.** Pegue com
`xcrun simctl get_app_container <UDID> com.irontracks.app`; não reaproveite o path
de antes (falha com `No such file or directory`). Para copiar o app entre
simuladores: `xcrun simctl install <UDID-destino> "$(xcrun simctl get_app_container
<UDID-origem> com.irontracks.app)"`.

Build p/ simulador (só quando precisar de código nativo novo):
```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,id=<UDID>' -derivedDataPath /tmp/itsim-dd \
  CODE_SIGNING_ALLOWED=NO build
```
Depois instala o `.app` de `/tmp/itsim-dd/Build/Products/Debug-iphonesimulator/App.app`.

**Finalizar treino no simulador é PERMITIDO desde 11/08/2026** — a conta do
simulador é a de teste, e o histórico do dono não é tocado (ver a seção das duas
contas). Sem isso, relatório, PDF, story e o recálculo do autoload não eram
verificáveis por ninguém. Use o **X → Descartar** quando a sessão não interessa,
e finalize quando o que você precisa ver está do outro lado. **A conta oficial
continua sem escrita, sempre.**

**Limitação conhecida:** com `CODE_SIGNING_ALLOWED=NO` a extensão do widget não registra as `ActivityConfiguration` — o log mostra `activitykit … Fetched descriptors for content states: []` e **a Live Activity não renderiza no simulador**. Isso é do build, NÃO é regressão. Não tire conclusão sobre a Ilha Dinâmica a partir do simulador.

## Descanso do treino — ações nativas chegam ATRASADAS

`REST_DONE` ("Iniciar Serie") e `SKIP_REST` ("Pular Descanso") são botões da notificação de tela bloqueada e ENCERRAM o descanso. **O iOS enfileira essas ações quando o app está suspenso** e as entrega quando ele acorda — depois de o usuário já ter concluído a série seguinte. Resultado relatado em treino: "aperto concluir e vai direto pro tempo de treino", intermitente e sempre na 1ª série do exercício (a que vem logo após o descanso anterior).

Guarda em `useNativeTimerActions`: ação nativa não encerra descanso com menos de 3s de vida — ninguém conclui uma série e decide pular o descanso no mesmo segundo. A decisão é tomada DENTRO do updater do `setState` (ler da closure devolveria o estado do render anterior). Descartes viram `logWarnRemote('workout.rest.native-action-ignored')`.

**Rest-Pause:** piso de 2 minis (`helpers/restPauseRules.ts`) — com uma mini-série o método deixa de existir. `planned_mini_sets` guardava `miniReps.length`, ou seja, o PREENCHIDO sobrescrevia o PLANEJADO e um dia incompleto rebaixava o plano do exercício para sempre.

## ⚠️ Live Activity (Ilha Dinâmica + tela bloqueada) — ZONA DE NÃO MEXER
**Esta área já quebrou 12+ vezes, sempre EM SILÊNCIO.** Antes de tocar em qualquer coisa aqui, rode `npx vitest run src/hooks/__tests__/liveActivityRegressionGuards.test.ts` e `src/utils/native/__tests__/liveActivityDiag.test.ts`. Se um guard falhar, você está reintroduzindo uma regressão conhecida — **corrija o código, não afrouxe o teste.** (Esta linha citava um `liveActivityTelemetry.test.ts` que NUNCA existiu no repo — conferido em 04/08/2026.)

**A telemetria daqui vai para DOIS lugares, e o segundo existe por um motivo prático.** `reportLiveActivityFailure` manda ao Sentry (tags `area:live-activity`, `activitiesEnabled`, `nativeError`) e `reportLiveActivityToAudit` grava em `audit_events` (`action = 'live_activity_start_failed'`). O Sentry sozinho não bastou: em 04/08/2026 a LA sumiu do iPhone do dono e o diagnóstico travou porque **o token do Sentry não existe no repo nem no ambiente local** — a pista estava lá e era ilegível de onde se investiga. Consulta:

```sql
select created_at, metadata->>'stage', metadata->>'nativeError',
       metadata->>'activitiesEnabled', metadata->>'platform'
from audit_events where action = 'live_activity_start_failed'
order by created_at desc limit 20;
```

`stage` responde a pergunta inteira: `not_native` = o bridge do Capacitor não estava pronto (a LA nem foi tentada); `empty_activity_id` = o ActivityKit recusou — aí `activitiesEnabled: false` significa que o usuário desligou Atividades ao Vivo nos Ajustes do iOS; `threw` = exceção no caminho. Só o TREINO reporta (o descanso nasce a cada série e viraria spam) e só com `window.Capacitor` presente (senão todo usuário da web geraria evento).

**Por que quebra sempre em silêncio:** os guards de plataforma (`if (!isIosNative()) return`) saem **sem reportar**. Aí nem Sentry nem teste veem nada — a feature morre e só o dono percebe, dias depois. Toda saída silenciosa nova nesse caminho é uma bomba-relógio.

**Os 3 vetores já corrigidos (não recriar):**
1. **Corrida do bridge** — `window.Capacitor` pode não estar injetado no 1º render da WebView. O efeito de start em `src/hooks/useWorkoutLiveActivity.ts` **precisa** depender de `nativeReady` (reavaliação) — nunca só de `[workoutStartMs]`, senão a LA nunca nasce.
2. **Limpeza de órfãs** — em `IronTracksAppClientImpl.tsx`, encerrar a LA assim que as settings carregam matava a activity recém-criada (`activeSession` chega async). **O atraso antes de `endWorkoutLiveActivity()` é obrigatório.**
3. **`load()` do plugin Swift** — ⛔ **INVESTIGADO E DESCARTADO. NÃO "CORRIJA".** Ele encerra todas as `Activity<RestTimerAttributes>`, e isso **está certo**: o `SceneDelegate` tem a trava `pluginRegistered`, então `load()` roda **uma vez por lançamento do app** (cold start) — NÃO a cada foreground nem em reload da WebView. No cold start o timer de descanso (JS) morreu junto com o app, então encerrar é o correto. Trocar por "só encerrar as vencidas" cria **Live Activities fantasma** contando sozinhas. Já foi analisado a fundo; não precisa de build.

**O relógio da ilha é do SISTEMA — pausa precisa ser dita (07/08/2026).** O tempo de
treino é desenhado por `Text(timerInterval:)`, que o iOS conta sozinho a partir de uma
data: ele não sabe o que é pausa. O app mostrava "PAUSADO 56:07" e a ilha seguia
subindo. Hoje o `ContentState` do treino carrega `pausedElapsedSeconds` (pausado →
texto ESTÁTICO) e `elapsedAnchorDate` (correndo → âncora `agora − decorrido`; o
`workoutStartDate` dos atributos é imutável e não consegue andar para frente depois de
uma pausa). Quem avisa é `useLiveActivityPauseSync`, chamado de dentro do
`WorkoutTimerProvider` — o dono do `pausedMs` e do desconto de background — e **só na
troca de pausa**, nunca por tique (ActivityKit limita ~120 updates/h). **Todo update
do estado do treino precisa PRESERVAR esses dois campos** (`updateWorkoutLiveActivity`,
`updateWorkoutRestCountdown`): sobrescrever com nil descongela o relógio no meio da
pausa. Limite conhecido: pausar DURANTE um descanso não congela o "Treino:" do banner
do descanso — ele nasce com a âncora corrigida e segue contando até o descanso acabar
(os atributos de uma activity não mudam depois de criada). Guards em
`src/hooks/__tests__/liveActivityPauseSync.test.tsx`.

**Quem fica em CIMA na tela bloqueada é o `relevanceScore` (21/08/2026).** Treino e
descanso coexistem; com relevância igual (default 0 para todas) o iOS empilha por
ordem de início, e o card do DESCANSO — o único que conta para trás e tem botão —
ficava embaixo do treino. Valores em `LiveActivityRelevance`
(`ios/App/App/RestTimerAttributes.swift`): descanso 100, treino 10. **A relevância
mora no CONTEÚDO, não nos atributos**: precisa ir em TODA montagem de
`ActivityContent` (são 7 no plugin) **e no push APNs** (`relevance-score`, em
`lib/push/apnsLiveActivity.ts`) — um update sem o campo volta ao default e derruba
o card no meio do descanso. Guard nas duas pontas:
`lib/push/__tests__/liveActivityOrdemTelaBloqueada.test.ts` (o do Swift fatia cada
chamada por parêntese balanceado, sobre o código sem comentários). Como é Swift, só
vale **com build nova**; o lado do push entra por deploy web.

**Arquitetura (o que exige build vs. o que não exige):** JS/hook/bridge = deploy web, vale na hora pra todos os apps instalados. Swift/widget/`pbxproj` = **só com build nova no TestFlight**. Por isso: **nunca** faça o JS chamar um método nativo que o build instalado não tem — vira `"IronTracksNative" plugin is not implemented on ios` (já gerou 6.833 eventos no Sentry).

**Integridade do alvo iOS:** o widget `IronTracksWidgets` precisa existir no `pbxproj`, estar em *Embed App Extensions* e ter os 4 fontes. `scripts/add-watch-target.rb` **reescreve o pbxproj inteiro** — é vetor real de perda de target (por isso existem os backups). O guard cobre isso.

## iOS — release pra App Store / TestFlight
**REGRA FIXA do usuário: SEMPRE subir build pro App Store Connect via terminal, NUNCA abrir Xcode UI pra Archive/Distribute. Faz o claude perder tempão.**

```bash
npm run ios:release           # bump build atual+1, archive, upload pra TestFlight
npm run ios:release 25        # força build = 25
```

O script `scripts/ios-release.sh`:
1. Bumpa `CURRENT_PROJECT_VERSION` no `project.pbxproj` (todos os build configs)
2. Roda `xcodebuild archive` (signing automático com cert "Apple Development: Maicon Benitz", team `5XLC55D3YR`)
3. Roda `xcodebuild -exportArchive` com `method=app-store-connect` + `destination=upload` — envia direto pra Apple

Em ~10 min depois aparece no TestFlight do iPhone do usuário. Auth reusa a session do Xcode em `Xcode → Settings → Accounts` (uma vez configurado, não pede de novo).

**Rode do REPO PRINCIPAL, nunca de um worktree.** O grafo SPM resolve os plugins Capacitor por caminho dentro de `node_modules/`; num worktree sem `npm ci` completo o archive morre em `the package at '…/@capacitor-community/apple-sign-in' cannot be accessed`. (Ver o gotcha de worktree lá em cima — a build iOS é o caso que mais dói.)

**Quando a `MARKETING_VERSION` PRECISA subir:** depois que uma versão é aprovada na App Store, a Apple fecha o "trem" dela e recusa build nova com o mesmo `CFBundleShortVersionString` — mesmo com build number maior. O erro vem no `exportArchive`, só na hora do upload (o archive passa):

```
90062: CFBundleShortVersionString [1.18] must contain a higher version
       than that of the previously approved version [1.18]
90186: Invalid Pre-Release Train. The train version '1.18' is closed
       for new build submissions
```

Aconteceu em 31/07/2026 (1.18 → 1.19) e **de novo em 22/08/2026 (1.20 → 1.21)** —
nas duas vezes o archive rodou inteiro antes de o upload ser recusado. Se for
subir build e a versão atual já estiver publicada, bumpe a `MARKETING_VERSION`
ANTES — evita um ciclo perdido (~5 min). **Estado em 22/08/2026: versão 1.21,
build 77 no TestFlight** (leva a ordem das Live Activities; ver a seção da LA).
O bump é `sed` nas 10 ocorrências do `pbxproj`, e o release refaz com
`npm run ios:release <build>` para não pular número.

⚠️ **`ios-submit.mjs` roda em LIVE SUBMIT por padrão, e flag desconhecida
ABORTA desde 27/08/2026.** O parser tinha `else if (!releaseNotes) releaseNotes = a`
como último caso: qualquer argumento não reconhecido virava as **"Novidades
desta versão"**. Um `--status` (flag que não existe ali) foi gravado como
release notes da 1.21.1 e ficou visível no App Store Connect — teria ido a
review assim se alguém submetesse sem olhar o campo. Nada foi submetido e o
texto foi limpo no mesmo dia. **Para só CONSULTAR o estado, use `--dry-run`**,
que lista builds e versão sem tocar em nada.

**Warning conhecido, não é falha:** `Upload Symbols Failed … dSYM for the Sentry.framework`. O upload conclui; o efeito é crash dentro do framework do Sentry vir sem símbolos.

## Badge do ícone (o "32" no app) — duas metades, e nenhuma marca como lido
O número no ícone é **recalculado pelo servidor a cada push** (`sendPushToUsers`
conta as notificações não lidas). Por isso zerar só no device não bastava: o 32
que o usuário acabou de ver voltava como 33 na notificação seguinte, e até
07/08/2026 ele só sumia quando o usuário abria o sino dentro do app.

- **Device:** `SceneDelegate.clearIconBadge()` zera a cada `sceneDidBecomeActive`
  (cold start E volta do background). Fica **antes** do `guard !pluginRegistered`
  — atrás dele só zeraria no primeiro launch. Muda Swift ⇒ **exige build nova**.
- **Servidor:** `user_settings.badge_cleared_at`, gravado por
  `POST /api/push/badge-seen` (hook `useBadgeSeen`, no boot e no `appStateChange`
  ativo). `countUnreadSinceCleared` (`lib/push/badgeCount.ts`) conta só o que
  chegou DEPOIS dessa marca.

**Abrir o app NÃO marca notificação como lida** — decisão do dono: o sino
continua com o indicador de não lidas até ele abrir a central. Não colapse as
duas coisas. Guards (incluindo source-guard do Swift e da fiação do `apns.ts`)
em `src/lib/push/__tests__/badgeCount.test.ts`.

## E-mail transacional (Resend) — "aceito" ≠ "chegou"

Provedor **Resend**, domínio `irontracks.com.br` verificado (região São Paulo).
Remetente padrão `IronTracks <noreply@irontracks.com.br>` — `RESEND_FROM` não
existe na Vercel, o default do código é que vale. Envio em
`utils/email/sendEmail.ts`, templates puros em `utils/email/approvalEmail.ts`.

**A lição que custou uma auditoria inteira (ago/2026): as duas metades.**

1. **Envio** — `fetch` para a API. Resolver NÃO significa aceito: era um
   `.catch(() => null)` sem olhar `res.ok`, então chave ausente, domínio não
   verificado e erro de rede saíam todos como sucesso. O `email_warning` da UI
   do admin era **código inalcançável** porque a função nunca lançava. Hoje
   `sendTransactionalEmail` devolve resultado tipado e nunca lança.
2. **Entrega** — chega **minutos depois**, por webhook. Nenhuma checagem no
   momento do envio alcança isso. Em 23/07 uma aprovação foi aceita (HTTP 200) e
   nunca chegou: caixa do destinatário cheia. `POST /api/webhooks/resend` existe
   só por causa disso.

**Onde ver o que aconteceu:** `audit_events`. `approval_email_sent`/`_failed`
(com `metadata.provider_id` = id da Resend) e `email_delivery_*` (com o mesmo id
em `entity_id`). `resolveDeliveryStatus` cruza os dois — gravidade manda sobre
recência, senão um `delivered` apaga o `complained` que veio depois.

```sql
select created_at, action, metadata->>'email', metadata->>'reason'
from audit_events where action like 'approval_email_%' or action like 'email_delivery_%'
order by created_at desc limit 20;
```

**⚠️ `logWarn` é NO-OP em produção** (`if (IS_PROD) return`). Para sinal de
falha em rota, use `logError` — desde 02/08/2026 ele chega ao Sentry também em
rota server (flush via `waitUntil` no `lib/logger.ts`) — **e** grave em
`audit_events` quando a pergunta precisar de resposta meses depois ("fulano
recebeu?"): log e Sentry expiram, o banco não.

**Templates:** o nome vem de `access_requests.full_name`, campo de **formulário
público sem `.max()`** — sempre `escapeHtml`. E-mail é HTML de 2005: tabela (não
flex/grid), CSS inline (clientes removem `<style>`), botão com fallback VML
(Outlook ignora padding em `<a>`), zero imagem externa (bloqueada por padrão —
por isso a marca é texto). Guards em `utils/email/__tests__/`.

## Supabase — padrões obrigatórios
- Novas migrations via MCP (`mcp__supabase__apply_migration` / `list_migrations`); ficam em `supabase/migrations/` com timestamp. Verificar `mcp__supabase__get_advisors` depois.
- **Row Level Security obrigatório** em toda tabela nova. `supabase-js` v2 (nunca v1). URL/keys só via `.env.local` (nunca hardcodar).

## RevenueCat / Apple IAP — zona de máximo cuidado
- **Nunca modificar** fluxos de purchase/restore sem entender o impacto completo
- Entitlement ID: `vip`
- Testar sempre em sandbox (TestFlight) antes de produção
- `NEXT_PUBLIC_ENABLE_IAP=true` controla se IAP está ativo
- Erros de IAP devem ser capturados e enviados ao Sentry

## Sentry — monitoramento de erros
- Configurado em `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Nunca silenciar erros com try/catch vazio — sempre capturar com `Sentry.captureException`
- Filtros de ruído configurados em `src/utils/security/`

## Tailwind CSS v4 — atenção
Este projeto usa **Tailwind v4** (não v3). A sintaxe e configuração são diferentes:
- Configuração via `postcss.config.mjs` (não `tailwind.config.js`)
- Importar via `@import 'tailwindcss'` no CSS (não `@tailwind base/components/utilities`)
- Não adicionar classes de v3 que foram removidas ou renomeadas na v4

## Erros TypeScript comuns a evitar
- Variáveis desestruturadas não usadas → remover do destructuring (não prefixar com `_`)
- Imports não utilizados → remover imediatamente
- `any` implícito → tipar explicitamente sempre
- `// @ts-ignore` → nunca usar, resolver o problema real

## Recuperação de senha — o que já custou investigação (06/08/2026)
"Pedi o e-mail e não chegou" quase virou caça a problema de entrega. Não era: o
Supabase **nunca tinha sido acionado** para aquela conta (`auth.users.recovery_sent_at`
nulo + zero `user_recovery_requested` em `auth.audit_log_entries`) — o endereço
digitado não era o do cadastro. **`resetPasswordForEmail` responde sucesso mesmo
para e-mail inexistente**, de propósito (anti-enumeração), e a tela transformava
isso em "e-mail enviado!". Agora a mensagem é condicional e toda tentativa vira
`password_recovery_requested` em `audit_events` com `metadata.matched` — é por
aí que se responde "por que não chegou", por SQL. **A resposta da rota
`/api/auth/recovery-attempt` é sempre `{ok:true}`: nunca devolva o `matched`,
senão a proteção contra enumeração cai.**

Os **códigos de recuperação** existiam pela metade: verificação
(`/api/auth/recovery-code` + `verify_recovery_code_admin`) e link na tela de login,
mas nenhuma tela chamava `create_recovery_codes` — `password_recovery_codes` estava
**vazia no projeto inteiro** e o link era beco sem saída. A geração agora está em
Configurações. A RPC roda como `auth.uid()` (só serve preventivamente, com o usuário
logado) e o banco guarda **só o hash** — não há como reexibir um código depois.

## Segurança — crítico
- **`.env.local` contém credenciais reais de produção** — nunca commitar, nunca logar, nunca expor
- Rodar `npm run scan:secrets` antes de qualquer commit em arquivos de config
- API keys apenas via variáveis de ambiente (`process.env.*`)
- `NEXT_PUBLIC_*` = exposto no cliente — nunca colocar secrets com este prefixo

## Regras de arquitetura
1. **Server Actions** em `src/actions/` — não criar lógica de servidor em client components
2. **Lógica de negócio** em `src/lib/` ou `src/utils/` — separada da UI
3. **Schemas Zod** em `src/schemas/` — validar inputs de API e formulários
4. **Tipos** em `src/types/` — interfaces de entidades do banco em arquivo dedicado
5. **Hooks** em `src/hooks/` — nunca lógica de negócio inline em componentes grandes
6. `useMemo` e `useCallback` onde evitam re-renders custosos (lista de exercícios, gráficos)

## O que nunca fazer (específico do repo — as regras gerais estão no CLAUDE.md global)
- `console.log` em código de produção (rodar `npm run scan:console` para encontrar)
- Modificar `middleware.ts` sem entender o impacto em autenticação de todas as rotas
- Fazer breaking changes em schemas do banco sem migration e rollback plan
- Commitar sem rodar TypeScript + ESLint (o husky bloqueia com zero tolerância a warning)
- Instalar pacotes pesados sem verificar impacto no bundle (`npm run analyze`)
- Modificar fluxos de autenticação sem testar login completo
- Deixar listeners do Supabase Realtime sem unsubscribe no cleanup

## Auto-merge ao terminar tarefa (quando trabalhando via PR)
Quando o agente está desenvolvendo numa branch e abriu PR, o fluxo padrão ao terminar a tarefa é:

1. Aguardar o `quality-check` do GitHub Actions ficar verde
2. Marcar o PR como ready (sair de draft)
3. Mergear com **squash** (mantém main com 1 commit por feature, casa com o histórico atual)
4. Vercel deploya prod automático no push pra main

**O merge tem que ser CONDICIONADO ao resultado, não encadeado depois da espera.**
Em 10/08/2026 mergeei um PR com o CI VERMELHO porque escrevi
`for … sleep …; done; gh pr merge` — o loop terminou (por falha, não por sucesso)
e o merge rodou em seguida, sem ninguém olhar o status. Forma certa:
```bash
s=$(gh pr checks <n> | grep quality-check | awk '{print $2}')
[ "$s" = "pass" ] && gh pr merge <n> --squash --delete-branch || echo "ABORTADO: $s"
```

Não é preciso pedir confirmação a cada PR — esta regra é a confirmação durável. Exceções em que o agente DEVE pedir antes de mergear:
- Mudança em `middleware.ts`, fluxos de auth, schemas do banco com migration, ou pagamentos (RevenueCat/IAP)
- CI vermelho ou flaky — investigar primeiro, não tentar contornar com `--no-verify` ou retry cego
- PR com revisões humanas pendentes não resolvidas

## Iron Rank — o "bug" que NÃO existia (ago/2026)

**Não há bug conhecido aqui.** Esta seção existe para impedir que a mesma
investigação recomece do zero.

Em 09/08/2026 um agente viu **"0kg levantados · Iniciante do Ferro"** no
simulador, cruzou com o banco de `djmkapple` (2.427.394 kg, 127 treinos) e
concluiu que o volume estava se perdendo. **A tela era de `djmkbrasil`**, a conta
de teste, que tem UMA sessão com o `notes` vazio — ou seja, **0 kg era o valor
correto**. Ver a tabela das duas contas na seção do simulador antes de suspeitar
de qualquer número.

O que sobrou daquela investigação, e vale por si:

1. **`if (!vErr)` sem ramo de erro** era real, e é bug de código independente da
   conta: o supabase-js entrega a falha no RETORNO, não como exceção, então o
   `catch` nunca via nada e o volume virava 0 em silêncio.
2. **`logWarn` é NO-OP em produção** — o único log do caminho não existia
   justamente onde importaria.
3. **Cachear um volume 0 contraditório** estendia qualquer falha momentânea por
   30 minutos, porque a chave só muda quando um treino entra ou sai do histórico.

Os três foram corrigidos (#716, #717, #721). A instrumentação abaixo está no ar e
**nunca disparou** — o que é coerente com não haver falha.

**Armadilha que continua valendo:** `iron_rank_my_total_volume` faz
`RAISE EXCEPTION 'not_authenticated'` quando `auth.uid()` vem NULL e o chamador
não é service_role. Testar o RPC por SQL **como service-role pula essa checagem**
— prova a matemática, não o caminho do cliente.

Onde olhar SE algum dia aparecer sintoma real (o Sentry recebe, mas o token não
existe no repo):

```sql
select created_at, metadata->>'stage', metadata->>'code',
       metadata->>'message', metadata->>'totalWorkouts'
from audit_events where action = 'iron_rank_volume_failed'
order by created_at desc limit 20;
```

`stage` responde quase tudo: `rpc_error` com `code` traz o erro do Postgres
(é aqui que `not_authenticated` aparece); `zero_com_historico` significa que o
RPC respondeu 0 para quem tem treinos — aí o problema é o parse, não a auth.

**O valor contraditório não é mais cacheado.** A chave é `user.id`+`totalWorkouts`
e só muda quando um treino entra ou sai do histórico, então gravar o 0
transformava uma falha momentânea em 30 minutos de "Iniciante do Ferro".

## Auditoria das ÁREAS DE CÁLCULO — 23/08/2026 (PRs #893–#900)

As oito áreas que fazem conta no app: **volume/força** (`report/setVolume.ts`,
fonte única) · **carga automática** (`utils/autoload/`) · **calorias**
(`utils/calories/`) · **nutrição** (`lib/nutrition/goals.ts`) · **avaliação
física** (`utils/calculations/bodyComposition.ts`) · **cardio** ·
**métricas de relatório** (`report/reportMetrics.ts`) · **gamificação**
(`ironRank`, streak, `pacing`).

Estado ao fim: **99,67% de linhas, 97,4% de ramos**. O que sobra é guarda
defensiva inatingível pela API (ver o commit do #900 — não gaste tempo tentando
cobrir: exigiria violar invariante interno).

### Dois bugs reais, os dois achados pelo BANCO e não pela leitura de código

**1. Dobras: equação de Jackson & Pollock com as entradas de OUTRO protocolo.**
`calculateBodyDensity` usa as constantes de J&P 7 dobras e a tela anuncia
"Pollock 7 dobras" — mas a soma trocava **peitoral** e **axilar média** por
**bíceps** e **panturrilha**. O que fechou o diagnóstico: as colunas
`pectoral_skinfold`/`midaxillary_skinfold` **existem no banco**, 6 das 9
avaliações as tinham preenchidas, e **nenhum código as lia** — era o formulário
antigo, que media certo. Os `%BF` gravados por ele (16,82 e 7,07) batem com a
soma correta. Erro medido: **1 a 1,9 ponto percentual**.
Hoje: `JP7_SKINFOLD_FIELDS` + `sumSkinfoldsJP7` (que devolve **`null`** quando
falta dobra — antes `?? 0` fazia ausente virar zero e o laudo saía com gordura
MENOR). Bíceps e panturrilha continuam sendo medidos, rotulados como
complementares, fora da equação.

**2. Streak contava dia UTC.** As duas rotas (`social/leaderboard`,
`social/profile`) bucketavam com `toISOString().slice(0,10)`; a Vercel roda em
UTC, então treino às 22h no Brasil caía no dia seguinte. Medido antes de
corrigir: **36 de 633 sessões (5,7%)** em dia divergente e **4 usuários** com a
contagem errada (um perdeu 2 dias, outro ganhou 1). Mesmo defeito que o heatmap
de nutrição já tinha — **a classe nunca tinha sido varrida**. Fonte única em
`lib/social/streak.ts`; `utils/cron/dateBrt.ts` já existia e ninguém usava.

### A chave do treino saía VAZIA nas duas pontas (#893)

`mapWorkoutRow` grava o nome do treino em **`title`** (`title: String(workout.name)`)
— o objeto da sessão **não tem `name`**. Os dois consumidores liam
`workout?.name ?? session?.name ?? ''`: string vazia, sempre. Efeitos: o botão
"Descarga do treino" ficava travado em DESLIGADA (com a lista de off vazia no
banco, só chave vazia explica) **e a priorização do histórico POR TREINO no
motor de carga nunca rodou** — `pickUsableHistory` só prioriza `if (wanted)`.
Fonte única em `lib/workout/workoutKey.ts` (`resolveWorkoutKey`).

### Duplicações unificadas

- **BMR/TDEE** (Mifflin-St Jeor) estava escrito em `bodyComposition.ts` e
  `nutrition/goals.ts`, com os mesmos coeficientes. Núcleo em
  `lib/health/mifflinStJeor.ts`; as duas APIs de domínio seguem existindo
  (assinaturas e erros diferentes servem a chamadores diferentes).
- Havia **cinco** implementações da soma de dobras (duas mortas). Restou uma.

### O que NÃO é bug (medido, para não reabrir)

- `isValidPercent` (0–100) e `isPlausibleBodyFat` (3–75) divergem **de
  propósito**: BIA digitada como "90" precisa APARECER na tela (para o usuário
  ver que errou) e não pode entrar na média. Unificar quebra uma das metades.
- Guardas de divisão por zero: varridas mecanicamente, **25 divisões por
  variável, todas protegidas**.
- Cadência **rápida** gasta MAIS e super-lenta gasta MENOS (TUT alto = menos
  reps por minuto). Contraintuitivo; escrevi o teste invertido antes de ler.

## Histórico de REFEIÇÕES — o irmão do de treinos (25/08/2026, PRs #919, #921–#924)

Cinco entregas no mesmo dia, puxadas por relatos do dono no iPhone. (O #920, da
mesma data, é outro assunto: o hook que fecha o treino ativo do simulador.)

O que vale guardar é o método. **Os SINTOMAS relatados estavam todos certos** —
"não aparece nada", "aparece numa linha só", "só abre a aba de nutrição". O que
não se sustentou foi uma HIPÓTESE de causa ("abre por baixo da aba de
nutrição"), e em dois casos quem decidiu o diagnóstico foi o BANCO, não a
leitura do código: o dado gravado dizia o que a tela não podia inventar.

### O molde tem dono — não copie o card do treino

`components/history/HistorySummaryShell.tsx` (chassi do card de resumo: véu
dourado, eyebrow, pílulas de janela, grade 2×4, linha de ações), `SummaryAction`
(o botão dessa linha) e `HistoryWeekDivider` ("Semana de dd/mm"). Treino e
nutrição consomem os três. Copiar o JSX era a saída barata e é a mesma deriva
que já produziu 86 tons de cinza e três cálculos de semana aqui.

Guard de CLASSE em `components/history/__tests__/historicoMesmoMolde.test.ts`:
quem redesenhar o chassi ou o divisor reprova, e **cada card só pode ter UM
`featured: true`** (`docs/DESIGN_HIERARCHY.md`).

⚠️ **O agrupamento semanal do histórico de TREINO contava a partir da SEGUNDA**
— contra a regra domingo→sábado de 24/08. O guard `semanaComecaNoDomingo` não
pegava porque o cálculo passava por uma variável intermediária (`dayOfWeek`) em
vez de chamar `getDay()` na mesma expressão: **guard de forma erra quando a
forma muda.** Corrigido nos dois; a fronteira agora sai de `weekRangeBrt`.

### O card do dia abre as refeições daquele dia

`lib/nutrition/dayMeals.ts` (puro) + `hooks/useNutritionDayMeals.ts` (busca sob
demanda, cache por dia). Duas regras que já quebraram este app em outras telas:

* **O dia é a coluna `date`, NUNCA derivado de `created_at`.** Uma refeição das
  23h30 em São Paulo tem carimbo no dia seguinte em UTC.
* **A hora sai de `created_at` com `timeZone` explícito.** Sem isso, o relatório
  impresso num servidor em UTC diz que o café da manhã foi às 11h.

⚠️ **O guard da hora precisa das DUAS metades.** O caso comportamental só
reprova onde o runner não está em BRT (o CI, em UTC): na máquina do dono ele
passa verde com o `timeZone` removido — medido. E **forçar `process.env.TZ` no
topo do arquivo de teste NÃO resolve**: o worker do Vitest já subiu e o Node
cacheia o fuso na primeira formatação (testado, sem efeito). Quem fecha o buraco
localmente é o source-guard que exige o `timeZone` na chamada.

**No PDF do período**, o detalhe por refeição tem teto de
`MAX_DIAS_DETALHE_REFEICOES` (31 dias) — acima disso ele sai e o relatório
**diz por quê**, no papel e na tela antes de exportar. Descobrir no arquivo que
faltam as refeições custa um PDF inteiro.

### "Clico no menu e não aparece nada" — não era z-index

`historyOpen` nascia de `useState(Boolean(openHistoryOnMount))`, e valor inicial
só vale na PRIMEIRA montagem. Com a aba de nutrição **já aberta** o
`NutritionMixer` não remonta: o item "Histórico de refeições" do menu do avatar
era um botão morto. O modal nunca chegava a ser pedido — a suspeita de "abre por
baixo do overlay" era razoável e falsa.

Hoje um efeito reage à prop **e o pedido é consumido** (`onHistoryOpened`): sem
isso a flag ficaria presa em `true` e o segundo clique morreria igual. Guard em
`__tests__/menuAbreHistorico.test.ts` — que **nasceu faltando**: a primeira
mutação passou verde e revelou que nenhum teste cobria o caso.

### A IA de lançamento passou a SEPARAR os alimentos

O lançamento por texto tenta primeiro o resolvedor local (`resolveFood`), que já
grava item a item com gramas; quando ele não reconhece a frase, cai em
`/api/ai/nutrition-estimate` — e o prompt mandava, **literalmente, "Some tudo e
retorne um único objeto"**. Resultado no histórico: "arroz branco cozido com
filé de tilápia grelhada" numa linha só, `grams: 0`. Medido na conta do dono
antes de mexer: **75 refeições com um item só contra 131 com dois ou mais**, e
as de um item são justamente as que passaram pela IA.

Hoje o prompt separa, estima a porção quando o usuário não diz, e o contrato vai
na chamada (`nutritionEstimateGenerationConfig`, padrão do repo). Medido contra
a API real: `180g Arroz branco cozido (234 kcal)` + `140g Filé de tilápia
grelhada (136 kcal)`.

**Duas fronteiras que não podem cair:**

1. **`itemsParaGravar` tem fallback.** Sem itens válidos (ou com um item só, que
   apenas repete a refeição e desalinha o total), grava o item único de sempre.
   Perder o lançamento porque o detalhe falhou é trocar incômodo por perda de
   dado. `items` fica FORA do `required` do responseSchema pelo mesmo motivo.
2. **Não desmontar preparo único.** A primeira medição devolveu "1 esfirra de
   frango com requeijão" como massa + frango + requeijão — o app desmontando o
   que o usuário lançou como UM item. A regra está no prompt e tem guard.

⚠️ **Refeição já gravada não muda.** O detalhe não existe no dado antigo, e
reprocessar com IA seria inventar sobre o passado.

### O parser DESCONFIA quando sobra comida na linha (25/08/2026, PR #926)

A frase acima ("o resolvedor local… quando ele não reconhece, cai na IA") estava
certa e incompleta: o problema é o resolvedor **achar que reconheceu**.

No chat da nutrição, `"140g de atum sólido ao natural mais 70g de proteína de
soja com 400ml de leite desnatado"` devolvia **162 kcal — o mesmo valor de comer
só o atum**. O match é pela CABEÇA do nome (`matchesAtHead`) e ignora o resto, o
que está certo para modo de preparo ("frango GRELHADO") e para prato composto
("esfirra de frango COM requeijão", que é UM item). O que ele não via era uma
**segunda porção escondida na mesma linha** — e, como não sobrava
`unknownLine`, a cascata do `resolveFood` (que só chama a IA quando sobra algo
não reconhecido) considerava sucesso e respondia com confiança. Falha silenciosa
com cara de acerto, oferecendo "Lançar no diário" com 1/3 das calorias.

Duas mudanças, e a segunda é a que pega a CLASSE:

1. **" mais " virou separador de item.** ⚠️ **" com " NÃO é, e não pode ser** —
   ele liga o prato ao ingrediente, e separar reintroduz exatamente o bug que o
   `matchesAtHead` existe para matar (39 kcal de requeijão no lugar de 224 da
   esfirra).
2. **Sobra com quantidade derruba o match** (`SOBRA_COM_QUANTIDADE`): casou a
   cabeça mas restou número + unidade **seguido de mais texto**? A linha vira
   `unknownLine` e a cascata segue. O parser não adivinha nada — admite que não
   é o dono daquela linha.

**O "seguido de mais texto" foi medido, não escolhido.** A primeira versão da
regra derrubou `1 fatia de pão integral 50g` (74 kcal → desconhecido): ali o
"50g" QUALIFICA a fatia, não abre comida nova. Comparação antes/depois em 12
frases: a única diferença é o caso do bug.

Verificado ponta a ponta contra Supabase e Gemini reais: a cascata desiste e a
IA devolve **535 kcal · P73,5** (140g atum 155 · 70g soja 235 · 400g leite 145).

**O aviso de peso é para o CHUTE, não para o dado.** O prompt do chat mandava,
em toda resposta, "cite o PESO ASSUMIDO… se parecer irreal, peça o peso certo".
A regra existe por um motivo real — o parser cai em 50g quando o alimento não
declara peso por unidade, e "uma pizza grande" virava 133 kcal —, mas disparava
também quando a pessoa tinha ESCRITO o peso: *"Comendo 140g de atum (que o app
assumiu como 140g)…"*. Hoje `ParsedMealItem.assumedWeight` marca só o que o app
converteu, e sem ele o prompt **proíbe** dizer que o app assumiu. Junto: proibido
dizer "exatamente" sobre valor de tabela — "use exatamente estes números" é
instrução de fidelidade e vazava como precisão de medição.

**Duas armadilhas de verificação desta tarefa:**

1. **Guard tautológico que a mutação pegou:** o `label` do item é a LINHA CRUA,
   então procurar `/ovos/` no texto do rótulo passava verde mesmo com o
   separador removido (um item só, rotulado com a frase inteira). O que prova
   separação é a CONTAGEM de itens.
2. **`gh pr merge --delete-branch` devolve para a `main` LOCAL, que fica atrás
   do merge.** Rodar um script de verificação logo depois executa o código
   ANTIGO — e o resultado parece regressão. Custou um "❌ o bug continua" que
   era falso.

   **Resolvido por construção: use `npm run pr:merge <n>`**
   (`scripts/pr-merge.mjs`). Ele recusa mergear com `quality-check` fora de
   "pass" (a regra que já foi violada em 10/08/2026, quando um `for … sleep;
   done; gh pr merge` mergeou no vermelho) e, depois do merge, alinha a `main`
   local com a origin. O `reset --hard` só acontece com a árvore limpa E o
   conteúdo idêntico ao da origin — depois de um squash os hashes diferem, mas
   a ÁRVORE é a mesma; havendo conteúdo local ausente na origin, ele para e
   devolve a decisão para o humano. A regra mora em `decidirSync`, função pura,
   travada em `src/__tests__/prMergeSync.test.ts`.

### "Abrir o dia para editar" — o botão que prometia e entregava metade

Trocar a data não bastava: a aba abre no TOPO e a lista de LANÇAMENTOS (única
superfície onde se edita ou apaga uma refeição) fica no fim da página. Com o dia
de HOJE, que é o caso comum, a tela não mudava nada.

Hoje o botão troca a data, **rola até a âncora** (`entriesAnchorRef`) e **abre o
editor**. As setas do `DateNavigator` continuam sem rolar, de propósito — ali o
usuário passeia pelos dias olhando o resumo do topo, e arrastar a tela a cada
toque sequestraria o gesto dele. Há guard para os dois lados.

**O editor não pode abrir no instante do toque:** `handleDateChange` esvazia a
lista, e ali os lançamentos ainda são os do dia anterior. O pedido fica pendente
(`editarAoCarregar`) e é atendido quando `entries` chega — e some sozinho se a
refeição não estiver mais lá, em vez de travar a tela. `abrirEditorDaEntry`
expande o card **e** semeia o rascunho: sem expandir, o editor abriria dentro de
um card fechado; sem rascunho, abriria vazio e salvar apagaria a refeição.

Tocar numa REFEIÇÃO do card do histórico edita AQUELA (o id viaja no
`onPickDate`); o botão do dia, sem id, abre a **mais recente**.

### Três armadilhas de verificação que custaram tempo nesta sessão

1. **O teclado do simulador está com dicionário em INGLÊS.** "peixe grelhado com
   batata doce" virou "Price grew Haro com Batista doce"; "cozido" virou
   "cozies". Digitar português no simulador não prova nada sobre texto livre —
   para conferir TELA, injete o dado na conta de teste por SQL; para conferir
   MODELO, chame a API direto.
2. **Teste que mede estado transitório passa por sorte.** `findByRole` + assert
   imediato num botão que nasce desabilitado quebrou no CI (mais lento) com o
   código CORRETO. O que se espera é a TRANSIÇÃO: quem espera é `waitFor`.
3. **Componente grande demais para montar pede source-guard.** `NutritionMixer`
   exige Supabase, imports dinâmicos e ~20 props — um teste de render ali mede o
   harness, não o app. O comportamento se prova no aparelho e o guard trava a
   CAUSA (a forma do código) voltar. Diga isso no arquivo de teste.

## A semana do app começa no DOMINGO (24/08/2026) — e "treino" tem piso

Duas queixas no mesmo dia sobre o push "Resumo da semana 📊", com causas
DIFERENTES. Fui ao banco antes de mexer, e só uma era bug.

**1. Semana domingo→sábado, em BRT.** Decisão do dono: a Fran treinou domingo a
sexta (6 treinos) e o resumo disse 5, porque o app fechava segunda→domingo
(ISO) e o domingo dela caía na semana anterior. **A agenda já começava no
domingo** — o resto do app é que estava fora de linha. Fonte única em
`utils/cron/weekRangeBrt.ts`; consumidores: `weekly-recap`, `muscle-map-week`
(+ cron de insights), `weekly-summary` e `leaderboard`. O defeito não era um
cálculo errado — eram **três** cálculos escritos à mão, e nenhum teste cobria a
fronteira. Guard de classe: `__tests__/semanaComecaNoDomingo.test.ts`.

⚠️ **Esse guard tem um ponto cego conhecido, e ele já deixou passar um caso.**
Ele casa com `getDay()` na mesma expressão; o histórico de treino calculava a
segunda-feira passando por uma variável intermediária (`dayOfWeek`) e escapou
até 25/08/2026 — o agrupamento "Semana de dd/mm" da lista ficou meses fora da
regra. Quem for mexer em fronteira de semana: use `weekRangeBrt`, e não confie
no guard como prova de que não há mais ninguém calculando à mão.

**Ficam FORA, de propósito** (allowlist do guard, com motivo): o reset de cota
VIP (`utils/vip/weekReset.ts`, segunda 03:00 BRT — é regra de cobrança, mexer
ali muda quando o crédito volta) e a grade do `WorkoutCalendarModal` (alinha
colunas, não define intervalo).

⚠️ **Transição:** `muscle_weekly_summaries.week_start_date` tem SEGUNDAS antes
de 24/08 e DOMINGOS depois. Nada foi apagado (é cache recalculável), e a rota
que lê "a mais recente" filtra `lte(semana corrente)` — senão a segunda órfã
vence o `order desc` e mostra a semana errada.

**2. Sessão de 1 série não é treino** (`lib/workout/countsAsWorkout.ts`). O
dono recebeu "7 treinos" tendo feito 5: as duas linhas a mais eram uma sessão
de **62 s com 1 série** (duplicata do treino da manhã) e outra de **11 min com
1 série**. O cron somava LINHAS de `workouts`, sem olhar dentro e sem exigir
`completed_at`. O corte foi **medido antes de escolhido** — 120 dias de
produção: 0 séries = 7 sessões (≤2 min), 1 série = 5 sessões (máx 11 min),
**2 séries = ZERO**, 3 séries = 2 sessões. Não existe sessão legítima com 1 ou
2 séries. Piso: **2 séries concluídas**, ou 1 série com **≥15 min** (essa
porta existe pelo CARDIO, em que a corrida inteira é um único log).

**O volume por músculo continua somando tudo** — uma série feita é volume real.
Quem ganhou critério é o CONTADOR mostrado ao usuário.

Bug extra achado no caminho: o ranking fazia `monday.setDate(getDate() -
getDay() + 1)`, que **no domingo aponta para amanhã** — o ranking da semana
ficava zerado o domingo inteiro.

## Notas de dados (evitar re-exploração cara do banco)
- **Histórico de treino / evolução de carga**: os pesos por série de sessões concluídas NÃO estão em `sets`/`exercises` (vazias p/ concluídos) — ficam no JSON de `workouts.notes`, no objeto `logs` ("exIdx-setIdx" → weight/reps/rpe). Mapa completo + SQL pronto + user IDs + project_id em **`docs/DATA_MAP_workout_history.md`**. Ler esse arquivo antes de consultar o banco sobre treino/carga.

## Auditoria 2026-08-13 — fechada em 14/08/2026 (PRs #805–#819)

O relatório vive em `Relatorio/auditoria-ponta-a-ponta-2026-08-13.md`; a
conferência achado-a-achado e as correções são a sessão de 14/08. **Fase 1
completa + Fase 2 parcial.** Mapa do que subiu, para ninguém reinvestigar:

| Achado | PR | Estado |
|---|---|---|
| SEC-06 bucket chat-media | #805 | rota `ensure-bucket` REMOVIDA (não tinha chamador) |
| SEC-01 XSS relatório | #806 | escape na atribuição + guard 5 payloads × 5 campos |
| SEC-02 delete sem conferir Auth | #807 | `deleteUser` verificado + `account_deleted`/`_delete_auth_failed` em audit_events |
| SEC-03 catálogo LGPD | #808 | `lib/account/userDataCatalog.ts` dirige export E delete (ver abaixo) |
| SEC-05 erro cru em resposta | #809 | `respondInternalError` (requestId) em 111 rotas + guard classe inteira |
| SEC-04 SECURITY DEFINER | #811 | migrations APLICADAS `20260814095015/31`; advisors 41→16 WARN |
| SEC-07/10/11 | #812 | connect-src + rate limit auto-reportável + npm audit 0 |
| Mapa muscular VIP quebrado | #813 | `maxItems` aninhado estourava o Gemini (400 desde 10/08) |
| SEC-08 guarda de origem | #814 | middleware, MODO RELATÓRIO (ver abaixo) |
| Xcode Cloud sempre vermelho | #815–#819 | verde no run #1732 (ver abaixo) |

**Duas janelas de observação ABERTAS — flags prontas, faltando só ligar:**
1. ~~**CSP**~~ — **LIGADO em 27/08/2026**, com a polaridade invertida. Detalhes
   na seção do middleware, que é onde este assunto mora.
2. **Guarda de origem (SEC-08)**: mutante+cookie de outra origem hoje só
   RELATA (kind `cross-origin`|`missing-origin`). Janela limpa (especialmente
   `missing-origin` zerado) → `ORIGIN_GUARD_ENFORCE=true` na Vercel. Função
   pura em `utils/security/originGuard.ts`; bearer/webhook/cron passam SEMPRE.

   ⚠️ **A janela NÃO EXISTIA até 29/08/2026, e esta nota prometia lê-la.** O
   relato era só `console.error('[origin-guard]', …)`, ou seja runtime log da
   Vercel — cuja retenção não passa de ~1 dia: buscar 7 dias responde que o
   intervalo excede a retenção e 24 h volta vazio. `audit_events` não tinha
   NENHUMA linha de origin. Ficaram 15 dias em modo relatório sem nada
   observável, exatamente a lição que o CSP já tinha aprendido duas seções
   acima (log expira e fica ilegível de onde se investiga; o banco não).

   Hoje o mismatch também vai para `audit_events` via
   `utils/security/originReport.ts` — dedupe por (tipo, origem, ROTA), teto de
   10 linhas por instância, `waitUntil` para a instância não ser congelada
   antes do envio, e **silêncio deliberado em toda falha**: isto roda no
   middleware, e um throw ali vira 500 no site inteiro (com o app nativo
   carregando o front deste servidor, levaria todos os aparelhos junto). A
   escrita sai do middleware e não de uma rota — no CSP a rota existe porque
   quem reporta é o NAVEGADOR; aqui quem detecta é o próprio servidor.

   ```sql
   select metadata->>'kind' as tipo, metadata->>'originHost' as origem,
          metadata->>'path' as rota, count(*) as n, max(created_at) as ultimo
   from audit_events where action = 'origin_guard_mismatch'
   group by 1,2,3 order by 4 desc;
   ```

   **Espere alguns dias de tráfego real antes de decidir** — a tabela começou
   vazia em 29/08.

**Catálogo LGPD (`lib/account/userDataCatalog.ts`) — ler ANTES de mexer em
export/delete de conta.** Fatos medidos que ele carrega: a maioria das
tabelas CASCATEIA no `deleteUser`; `error_reports` é ON DELETE RESTRICT (sem
o delete manual dela, a exclusão de quem já reportou erro FALHA — foi bug
vivo); storage nunca cascateia; tabela nova sem decisão no catálogo reprova
no guard — o vermelho é o pedido de decisão.

⚠️ **Esse "reprova" depende de uma FOTO, e a foto envelhece (22/08/2026).** O
guard compara o catálogo com `PROD_TABLES_SNAPSHOT`, uma lista fixa no arquivo
de teste — ele não pergunta nada ao banco. Entre 14/08 e 22/08 passaram SEIS
tabelas sem decisão nenhuma: as quatro do treino em equipe (#859) e as duas do
import de ficha por foto (#881, que guarda IMAGEM do usuário), mais o bucket
`workout-imports`. Todas cascateiam, então o delete nunca esteve quebrado — mas
o EXPORT LGPD ignorava esses dados, porque a rota itera o catálogo. **Migration
nova = re-rodar o SQL do cabeçalho do catálogo e comparar com o snapshot**, na
mesma tarefa.

**Xcode Cloud — o workflow 'App | Default' (push na main, só Archive) ficou
verde depois de 4 bloqueios em cadeia**, todos diagnosticados pela ASC API
(a chave do repo lê builds/issues — não precisa do painel web):
`ios/App/ci_scripts/ci_post_clone.sh` instala Node + `npm ci`, desliga as
defaults `IDEPackage*` (o originHash do Package.resolved VARIA entre
toolchains — lockfile commitado nunca satisfaz o runner) e roda o
`patch-ios.mjs` com `env -u CI` — o patch SE PULA quando `CI` está setado
(guarda para a Vercel) e o Xcode Cloud seta `CI=TRUE`. Guard:
`src/__tests__/xcodeCloudCiScript.test.ts`.

**Pendências com dono definido:** FCM sem env vars na Vercel → push Android
MUDO desde 24/07 (59 eventos; as 3 chaves não existem no repo — é service
account do console do Firebase, só o dono gera). Restante da auditoria não
atacado: ATS iOS (SEC-09, exige build + aparelho físico), E2E/SAST no CI,
sprint de performance (PERF-01…08), `pg_trgm` fora do schema public.

## Auditoria de COBRANÇAS 2026-08-14 — fechada no mesmo dia (PRs #821–#828)

Relatório + verificação achado-a-achado + fechamento em
`Relatorio/auditoria-cobrancas-2026-08-14.md` (ler o FECHAMENTO antes de mexer
em billing). O que fica de regra para esta área:

- **O supabase-js NÃO lança em erro de escrita** — devolve `{ error }`. Foi a
  causa-raiz de metade da auditoria (professor recorrente "ok:true" sem linha,
  webhooks respondendo 200 com o banco falhando). Em rota de dinheiro, toda
  escrita destrutura `{ error }` e falha vira retry do provedor (500/503) —
  nunca 200.
- **Status gravado tem que existir no CHECK do banco.** O webhook RevenueCat
  escrevia `canceled`/`expired` (não existem em `app_subscriptions_status_check`
  → 23514) e, com o dedup marcado ANTES das escritas, o evento morria no retry
  (`200 deduped`). Vocabulário: subs `pending/active/past_due/cancelled/inactive`,
  entitlements idem + `trialing/revoked`. Guard de teste trava isso.
- **Dedup de webhook tem DOIS modos de falha**: duplicata (200) ≠ backend de
  dedup fora (503 + Retry-After, o provedor reenvia). E falha de escrita depois
  de marcar o dedup LIBERA a chave (`cacheSetNxStatus` em `utils/cache.ts`).
  No Asaas o dedup é ledger na própria tabela de eventos: duplicata só é
  descartada se a entrega anterior CONCLUIU (`processed_at`).
- **Janela de plano vem do PROVEDOR, nunca de `new Date()`** —
  `date_approved`/`next_payment_date`/`expiration_at_ms`. Reentrega recomputa a
  MESMA validade; "agora + intervalo" fazia cada reentrega estender o plano.
- **`CANCELLATION` (RevenueCat) = auto-renew desligado**, acesso até
  `expiration_at_ms` (`cancel_at_period_end`); só reembolso
  (`cancel_reason=CUSTOMER_SUPPORT`) corta na hora. `BILLING_ISSUE` = `past_due`
  (o resolvedor aceita) + grace period. Só `EXPIRATION` encerra.
- **O entitlement `valid_until=null` de produção é INTENCIONAL** (conta do
  Apple App Review, `metadata.lifetime_grant: true`) — NÃO expirar; o webhook
  não toca em linha com `lifetime_grant` e não cria entitlement ativo sem
  expiração (vitalício é concessão manual).
- **Assinatura recorrente de PROFESSOR** mora em `app_subscriptions` com
  `plan_id NULL` (tier em `metadata.tier_key`; as chaves de `teacher_tiers` não
  existem em `app_plans`). O resolvedor VIP exclui linhas sem plano do fallback.
- **Checkout MP**: tentativa local PRIMEIRO, `X-Idempotency-Key` = id da
  tentativa, e falha do POST reconcilia via
  `findRecentPendingPaymentByReference` antes de desistir (timeout ≠ não criou).
- **A CLI da Vercel desta máquina NÃO alcança o projeto** `app-iron-tracks`
  (está logada em outra conta; o projeto vive no time "djmk's projects" —
  mesmo o MCP dessa conta não tem tool de env var). Env var nova = dono no
  painel.

**Asaas foi DESCONTINUADO pelo dono (14/08/2026)** — os provedores ativos são
Apple (RevenueCat) e Mercado Pago. **Não configurar `ASAAS_WEBHOOK_SECRET`**:
sem o secret o webhook responde 500 fail-closed e o canal fica morto por
desenho — é o estado desejado. Banco conferido no mesmo dia: zero entitlements
Asaas, zero eventos, e a única assinatura Asaas (conta de teste, vencida desde
abril) já foi cancelada na reconciliação. O código Asaas (webhook,
`lib/asaas.ts`, branches nos cancelamentos, colunas `asaas_*`) é LEGADO com
guards verdes — a REMOÇÃO é tarefa própria, não foi feita; quem for removê-la
varre também `marketplace_payments`/`marketplace_subscriptions` e o
`app_subscriptions_provider_check` antes de mexer.

**Pendências (dono):** decisão A11 (Google Play Billing vs remover checkout
externo no Android) · sandbox ponta a ponta (Apple + Mercado Pago).

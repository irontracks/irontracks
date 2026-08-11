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

**Treino ativo** (`src/components/ActiveWorkout.tsx`): estado em `useActiveWorkoutController` (retorna `{ value, logs }`). O `value` (estável) vai no `WorkoutProvider`; os `logs` (mudam a cada tecla) num `WorkoutLogsProvider` separado (`components/workout/WorkoutContext.tsx`) — por performance. **`ExerciseCard` consome os DOIS**; renderizar fora de um deles lança erro (foi um crash real no overlay do parceiro). Logs = mapa com chave `"exIdx-setIdx"`. CRUD/organizar/editor-completo em `components/workout/hooks/useWorkoutExerciseCrud.ts`; editar mid-sessão remapeia os logs por índice (`helpers/reconcileEditedExercises.ts`).

**Renderers de série — 14 irmãos que divergem em SILÊNCIO** (`components/workout/set-renderers/`): `ExerciseCard.renderSet` roteia cada série pro renderer do método (normal, drop, rest-pause, cluster, grupo/Bi-Set, stripping, FST-7, ponto zero, forçadas, negativas, parciais, sistema 21, onda, cardio/plank). Cada um reimplementa peso/reps/RPE/concluir **por conta própria** — e é aí que nascem os bugs: em jul/2026 o Bi-Set exigia reps pra concluir (a normal não exige) e travava o botão sem explicar, e o drop escondia o peso das etapas porque o `truncate` colapsava o texto inline. **Mexeu em comportamento de série, varra os 14** (`grep` no diretório) — o que parece bug de um método quase sempre é divergência da família. Widgets compartilhados (ex.: `FailureToggle`) existem pra não replicar 14×.

**Motor de carga automática (autoload)** — `utils/autoload/`: `suggestWeight.ts` (núcleo puro: e1RM Epley ajustado por RPE → inverte pro alvo; trava anti-regressão, teto de +10%/sessão, prontidão só amortece), `plateMath.ts` (arredonda pro incremento montável, pra baixo), `equipmentFromName.ts` (infere equipamento pelo nome pt-BR). Fiação em `hooks/useWorkoutAutoload.ts` (reusa o `reportHistory` do `useWorkoutDeload` + check-in de hoje). Gate: `settings.autoLoadBeta && settings.autoLoad`. `useAutoloadWeight.ts` é o hook que os renderers avançados usam. **`weightSource: 'user'` no log = o usuário assumiu aquela série; o motor NUNCA reescreve depois disso.**

**O motor aprende os pesos que a MÁQUINA tem** (`machineGrid.ts`). `plateMath` assume máquina de 5 em 5 kg — falso em boa parte dos aparelhos: a "Mesa flexora" desta base registra 18, 23, 27, 32, 36, 41… (stack em LIBRAS, 10 lb = 4,54 kg), e o motor pedia 20/25/30/35/40, valores que não existem ali. Agora os pesos JÁ REGISTRADOS são a verdade sobre o que é montável (`collectKnownWeights` varre TODAS as sessões, sem filtrar deload/treino — um peso registrado prova que o furo do pino existe). Snap só desce ou iguala; acima do topo extrapola pelo passo aprendido; **desiste (volta ao plateMath) quando o alvo cai num buraco do histórico** — snapar 45 para 30 seria regressão inventada por falta de dado.

**Falha muscular (`log.failure`) alimenta o motor, não é só enfeite.** `suggestWeight` não progride a carga quando a última sessão foi à falha (`anyFailed`). O caminho é longo e já esteve QUEBRADO no meio: log → `useWorkoutDeload` monta `setFailures` no `ReportHistoryItem` → `buildHistorySets` repassa `failed` → motor. Até jul/2026 os dois últimos elos não existiam, então a trava nunca disparava e a carga subia após séries que estouraram. Exibição: `ReportExerciseCard` (marca + contagem) **e** `buildHtml.ts` (PDF) — os dois. **A flag é SEMPRE marcação manual do usuário** — Heavy Duty e Repetições Forçadas vão à falha por definição e deliberadamente NÃO a gravam: se gravassem, a carga congelaria no `topWeight` para sempre e o aluno nunca progrediria nesses métodos (decisão do dono, jul/2026; guard em `set-renderers/__tests__/failureIsManualOnly.test.ts`). Não confundir com `reps_failure`, que é a CONTAGEM de reps até falhar, coletada no modal desses dois.

**`useInputField` (`set-renderers/normalSet.tsx`) — zona de corrida.** Cada input de série tem estado LOCAL porque o ticker de 1s re-renderiza tudo e um input controlado perderia tecla. O efeito de sincronização com o valor externo já jogou fora valor digitado duas vezes: a guarda anti-descarte precisa considerar a **digitação** (`typedAtRef`), não só o blur — com `blurredAtRef` ainda 0, `Date.now() - 0` é gigante e a guarda não pega. Sintoma no device: "digito o RPE e some", só em campos unilaterais (o re-sync do autoload dispara um `updateLog` extra logo após a tecla).

**Bug intermitente que não reproduz: instrumente, não chute.** Padrão `logWarnRemote` (`lib/logger.ts`) = warning pesquisável no Sentry (≠ `logError`, que é exception). Foi assim que o "RPE some" saiu de fantasma pra corrigido em 24 h — o payload entregou a causa. Toda saída silenciosa em caminho crítico é bomba-relógio.

**Bi-Set / Super-Set / Tri-Set…** — `lib/workoutGroups.ts` (`buildExerciseGroups`) infere grupos por exercícios CONSECUTIVOS de mesmo método (sem schema novo). `ExerciseList` auto-alterna entre os membros ao concluir uma série; o descanso só pode rolar no **último membro do par** (o enunciado do método é "0s descanso entre eles"). **O run consecutivo é fatiado pelo TAMANHO do método** (`GROUP_METHOD_SIZE`: Bi-Set/Super-Set/Pré-/Pós-exaustão = 2, Tri-Set = 3; Giant-Set sem tamanho fixo) — sem isso, 4 Bi-Sets seguidos (= dois pares, caso real do treino de braço) viravam um grupo de 4 e o 2º exercício nunca descansava. Guards: `src/lib/__tests__/workoutGroups.test.ts` e `set-renderers/__tests__/groupMethodRest.test.tsx`.

**Sessões ficam em `workouts.notes`** (JSON serializado como TEXT), NÃO numa tabela de sessões. `workout_session_logs` está praticamente vazia em produção — **não confie nela**. Finalização: `useWorkoutFinish` → `buildFinishWorkoutPayload` (`src/lib/finishWorkoutPayload.ts`) → `POST /api/workouts/finish` (idempotente via `finish_idempotency_key` + lock Upstash). No finish, `buildReportMetrics` (`utils/report/reportMetrics.ts`) computa e grava `reportMeta` dentro do notes.

**Orçamento de payload das rotas quentes (histórico + bootstrap).** Como a sessão inteira mora em `workouts.notes`, qualquer rota que selecione essa coluna e repasse a linha crua serve centenas de KB sem parecer errada. O histórico já engordou assim uma vez (corrigido em ago/2026 por `utils/history/slimHistoryRow.ts` — a rota resume no servidor e o JSON completo é buscado sob demanda). Guards de CI: `utils/history/__tests__/historyPayloadBudget.test.ts` (teto de 450 B por linha de treino, allowlist de chaves, source-guard do `select`) e `app/api/dashboard/__tests__/bootstrapPayloadShape.test.ts` (allowlist de workout/exercise/set nos DOIS caminhos — RPC e fallback TS —, teto por template e source-guard das chaves do `jsonb_build_object` na migration mais recente da RPC). Fixtures realistas em `src/__tests__/fixtures/hotRoutePayloads.ts`. **Campo novo nessas rotas = teste vermelho de propósito**: é o pedido de revisão, não um falso positivo — atualizar a allowlist é uma decisão consciente. Dívida conhecida travada por ratchet: usuário SEM template cai no 2º branch do bootstrap (rota e RPC), que devolve "qualquer workout do user" — inclusive sessões concluídas com o `notes` inteiro.

**Calorias:** modelo MET em `utils/calories/metEstimate.ts` (`estimateCaloriesMet`) + wrapper `estimateSessionKcal` (lê o JSON de `workouts.notes`). Por exercício = rateio do total via `utils/calories/distributeKcal.ts`. Relatório React usa `reportMetrics`; o **PDF/compartilhamento é um gerador HTML separado** em `utils/report/buildHtml.ts` (`buildReportHTML`/`buildReportData`) — mexeu num, cheque o outro.

**Nutrição:** DUAS superfícies distintas — a página `/dashboard/nutrition` (`NutritionMixer`) e o `NutritionOverlay` (a aba NUTRIÇÃO do dashboard). Ambas derivam a meta de `nutrition_goals` (salvo) ou do TDEE do perfil (`user_settings.preferences`) — hoje pelo **`userSnapshot`** (ver abaixo), não cada uma por conta. Ao mexer em meta/nutrição, ajuste as DUAS. **O overlay renderiza o MESMO `NutritionMixer`** — ou seja, todo card da página existe também no app nativo; a exceção continua sendo a navegação até a página, que só a web tem.

**Cor de macronutriente tem fonte única: `lib/nutrition/macroColors.ts`** (âmbar/azul/laranja + `MACRO_SURFACES` para blocos). Nasceu porque a mesma decisão estava escrita TRÊS vezes, diferente em cada lugar, e duas conviviam na mesma tela: o carboidrato era azul no card Macronutrientes e amarelo no de Lançamentos, e a gordura usava `#ef4444` — a cor de ERRO do app —, então 23 g de gordura pintavam um bloco inteiro de vermelho. **Vermelho é só estouro de meta** (`MACRO_OVER_COLOR`). Guard em `__tests__/nutritionEntryCard.test.tsx` reprova hex de macro dentro de componente.
> ⚠️ **Pendência para o dono:** proteína (`#fbbf24`, matiz 43°) e gordura (`#f97316`, 25°) estão a **18,7°** — abaixo dos 40° que o heatmap exige de si mesmo. Onde há rótulo ao lado, passa; na barra empilhada do card de lançamento, âmbar e laranja ficam adjacentes (hoje o azul do carbo entra no meio e salva). Trocar a cor da gordura mexe em 3 telas — decisão não tomada.

**Heatmap Treino × Nutrição:** o bucketing por dia vive em `lib/nutrition/correlationDays.ts` (função pura, dia sempre BRT). Antes a rota fazia `toISOString().slice(0,10)` — dia UTC —, então **todo treino depois das 21h BRT acendia o quadrado do dia seguinte** e o próprio "hoje" da grade virava amanhã. A rota não devolve mais `workout_calories`: era o literal `300` por sessão exibido como se fosse medição.

**`MyDietPlan` — o posicionamento automático não pode vencer o usuário.** "Abre no dia de HOJE" roda no efeito que observa `days`, e os botões de dia já estão na tela nesse instante: quem tocasse num dia antes de o efeito rodar era devolvido para hoje em silêncio, e o swap ia para o índice errado. `positionedRef.current = true` é marcado no efeito **e no clique**. Guard varre os sete dias da semana.

**"Já treinou hoje?" tem fonte única: `lib/workout/trainedToday.ts`** — usada pelo `QuickStartCard` (o atalho "Treinar agora" some depois da sessão concluída) e pelo `RestDayPromptCard`. Dia BRT, `is_template = false`, e **nunca** selecionar `workouts.notes` para responder um booleano.

**`userSnapshot` (`lib/user/snapshot.ts`) — o LEITOR único dos dados do usuário. Comece por ele antes de escrever qualquer `from('user_settings')`.** Devolve os fatos já resolvidos (antropometria declarada, objetivo, fase da dieta, stats de TDEE, meta do dia + de onde ela veio) por setor: `profile`, `nutrition`. Nasceu porque as mesmas 5 chaves de perfil eram extraídas em DOIS lugares independentes (`extractProfileStats` e o `profileSection` do `userContext`) e a fiação "meta salva > TDEE do perfil" existia em TRÊS (página, overlay, contexto de IA) — o tipo de duplicação que não quebra nada hoje e diverge em silêncio no dia em que o perfil ganhar um campo.

**Não é depósito: não existe tabela `user_snapshot`,** nada é sincronizado, nada é gravado. O que é derivado na leitura não fica velho — uma tabela espelho seria uma segunda fonte de verdade, exatamente o padrão que já custou caro aqui. Quatro regras (documentadas no cabeçalho do módulo): modular por setor · derivado nunca persistido · **jamais selecionar `workouts.notes`** (a sessão inteira mora lá; seria o engorda-payload que o `slimHistoryRow` desfez, em escala maior) · degrada por setor **sem engolir o sinal** (daí `savedGoalsError`, que alimenta o aviso de schema ausente da página). As duas leituras internas saem em PARALELO — o leitor único não pode custar round-trip a quem o adota, e há guard que fica vermelho se alguém serializar.

**O snapshot entrega FATOS; quem exibe aplica POLÍTICA.** O piso `DEFAULT_GOALS` e o rótulo da origem (`saved`/`profile`/`default`) vivem em `lib/nutrition/displayGoals.ts` (`resolveDisplayGoals`) — eram a última coisa escrita duas vezes, com a constante copiada em cada superfície.

**Ratchet:** `lib/user/__tests__/userSettingsReadRatchet.test.ts` congela a lista de quem ainda lê `user_settings` direto (20 arquivos), agrupada por MOTIVO. Ela só encolhe: **arquivo novo lendo direto reprova, e entrada que já migrou também reprova até sair da lista** — sem a segunda metade a allowlist vira papel de parede e o débito fica congelado com cara de resolvido. O administrativo (LGPD, painel de professor/admin) lê a linha inteira de propósito e provavelmente fica fora do snapshot para sempre. Mapa completo de quem lê o quê: **`docs/USER_DATA_MAP.md`** — leia antes de investigar de novo onde mora um dado do usuário.

**Plano alimentar salvo + troca de alimento (ago/2026).** A dieta gerada era efêmera; agora salva em `student_diet_plans` — a MESMA tabela do plano prescrito pelo professor, separadas por `created_by`: `= user_id` é plano próprio (editável), `≠` é do coach (read-only). A rota `prescribed-plan` filtra por `.neq('created_by', userId)`; sem isso a dieta que o usuário gerou aparece como recomendação do coach, num card que trava a edição. Leitura SEMPRE por `planDays()` (`lib/nutrition/dietPlanShape`), que normaliza plano de um dia (`meals`) e de semana (`days`) numa lista só — e recomputa os totais dos itens, nunca lê total gravado.

**O motor de troca de alimento não usa IA — e o repertório "aprendido" É LIXO.** `nutrition_learned_foods` guarda o que o usuário DIGITOU no lançamento, e ele digita refeição inteira: dos 42 "alimentos" da conta do dono, **1** servia de substituto (37 compostos, 14 com densidade fisicamente impossível — 1070/1285/1650 kcal/100 g, que é o TOTAL da refeição gravado no campo `per_100g` —, 17 com a quantidade no nome). **A fonte certa é `nutrition_meal_entries.items`**, que o parser já quebrou em alimentos individuais com gramas e macros absolutos (`{"label": "150g arroz", "grams": 150, …}`) — daí sai nome limpo e macros/100 g derivados de gramas reais (`lib/nutrition/mealItemFoods`). Todo candidato passa por `foodItemSanity` (sem composto, sem densidade impossível, sem quantidade no nome).

**Classificar alimento por macro dominante SOZINHO produz sugestão absurda.** Auditoria de 132 trocas reais (04/08/2026) pegou: bife virando ovo (gordura dominava), leite desnatado virando substituto de mamão e feijão (caía em fruta/verdura), maionese virando bolo, arroz virando "orange chicken". As cinco regras que consertaram, todas em `foodSwap`: (1) proteína ≥ 10 g/100 g e ≥ 25% das kcal manda, mesmo com gordura maior; (2) `produce` exige proteína < 35% das kcal — o corte fica ENTRE leite desnatado (39%) e alface/brócolis (26–29%), e apertar demais joga alface em `carb`; (3) `mixed` NÃO troca (sem saber o papel, é chute); (4) dentro de `fat`, candidato com > 25% das kcal em carbo sai (separa requeijão de brigadeiro); (5) porção que encosta no clamp (10 g/1000 g) é recusada. Além disso, a adequação à refeição vem do HISTÓRICO (`mealContext`: em que refeições ele já comeu aquele alimento), não de lista fixa — e alimento sem histórico não é bloqueado, só não ganha preferência. **Ao mexer aqui, audite contra dados reais e LEIA as sugestões: os filtros mecânicos diziam "0 problemas" enquanto o motor sugeria trocas que ninguém faria.**

**O gerador de cardápio tinha o MESMO defeito de fonte — e ninguém percebeu porque o consertado foi o outro caminho.** O motor de TROCA migrou para `nutrition_meal_entries.items` em 03/08; o de GERAÇÃO (`food-profile.ts` → prompt do `dietGenerate`) ficou lendo o cru até 04/08/2026. Duas fontes erradas: (1) `nutrition_meal_entries.food_name` é o nome da REFEIÇÃO, então o prompt mandava "os alimentos que este usuário já come: Almoço (36×), Pós treino (21×), Janta (19×), Café da manhã (18×)…" — 13 dos 20 eram rótulo; (2) `nutrition_learned_foods` sem crivo. O modelo improvisava em cima disso e o dono recebeu um "Plano Cardioprotetor" com **whey 30 g e aveia 40 g secos** no café da manhã e pão francês no almoço. Hoje o repertório sai dos ITENS, passa pelo mesmo `foodItemSanity` da troca e vai ao prompt **agrupado por refeição** (`foodProfileToPromptSections`: "- Almoço: arroz, feijão, patinho") — é o agrupamento, não uma lista fixa, que impede pão com doce de leite de cair no almoço. **Ao tocar em qualquer coisa que alimente prompt de nutrição, cheque as DUAS pontas: o que a troca lê e o que a geração lê.**

**Bater o macro não é entregar comida — `lib/nutrition/mealCoherence.ts`.** Guard determinístico sobre o cardápio gerado, em duas classes: veículo faltando (pó sem líquido) é objetivo e **repara** (acrescenta Água 0 kcal para whey/creatina, Leite desnatado para aveia/sucrilhos); incoerência de composição (dois doces na mesma refeição, doce dominando as kcal) só REPORTA, e o motor devolve o problema ao modelo numa única retentativa. Nunca ampute o prato num reparo mecânico: remover comida derruba o plano abaixo da meta. Armadilha do módulo: `/leite/` casa com "doce de leite" e "leite condensado" — sem `NOT_A_LIQUID` o guard declara que o café da manhã do caso real já tinha líquido, ou seja, passa verde exatamente na refeição que existe para pegar. Fiação provada em `__tests__/dietGenerateCoherence.test.ts` (Gemini mockado devolvendo o cardápio real reprovado).

**A variação da SEMANA desfazia a coerência do dia-base — conserte os dois motores, sempre.** Testado no simulador em 04/08/2026 sobre um plano recém-gerado: o dia base saiu "Leite desnatado · Whey · Sucrilhos · Pão" e a terça, derivada pelo motor de troca, virou "**ovo mexido** · Whey · Sucrilhos · Pão". Causa: leite desnatado tem 36% das kcal em proteína, então `classifyFood` o põe em `protein` — mesma classe do ovo mexido. Pelo macro a troca é impecável; na prática devolve o prato seco. Três correções: (1) `isVehicleLoadBearing` tira do sorteio o item que sustenta o veículo; (2) `liquidKindOf` distingue líquido **cremoso** de **fino** — água satisfaz whey e NÃO satisfaz sucrilhos/aveia (o guard antigo só perguntava "tem líquido?" e deixou passar "sucrilhos + Água"); (3) `isCondiment`/`isPreparedPlate` no `foodItemSanity` — maionese entrou no lugar do abacate (ambos `fat`) e "pedaços de pizza de alcatra acebolada" no lugar do patinho (ambos `protein`). O `buildWeekFromDay` ainda repara cada dia derivado, porque a troca pode INTRODUZIR um pó onde não havia. **Guard só vale com macro real: com `protein: 9, fat: 1` no leite a troca nem acontece e o teste passa verde com o bug reposto** — a fixture usa os números que estavam no banco.

**Classe de macro certa ≠ papel no prato certo (`isRoleCompatible`).** Depois de consertado o líquido, o mesmo plano ainda trouxe "pão francês 100 g → **doce de leite tirol 105 g**" no café de sábado e "patinho moído 200 g → **whey growth 95 g**" no jantar de quinta. As duas trocas são impecáveis pelo macro (carbo por carbo, proteína por proteína) e ninguém executa nenhuma. Duas regras estreitas, aplicadas dentro do `swapFood` (vale para a semana E para o botão de trocar): doce concentrado só substitui doce concentrado; suplemento em pó não substitui comida de prato em refeição principal (pó por pó segue valendo). **Ao mexer no motor de troca, leia as sugestões contra um plano real** — os filtros mecânicos ficam verdes enquanto o cardápio fica impossível.

**O horário das refeições sai do histórico, não de palpite (`lib/nutrition/trainingSchedule.ts`).** O gerador marcava "Pós-Treino 18:30" para quem treina às 6 da manhã, e o app tinha a resposta gravada em DOIS lugares: `workouts.completed_at` (12 sessões seguidas terminando 07:34–08:29) e a hora em que ele lança o "Pós treino" (09:04, 09:19, 10:04). **O jejum também é derivado, não declarado**: em 11 dos 12 dias de treino não houve refeição antes do treino terminar. `deriveTrainingSchedule` devolve mediana de término, início estimado, período e `fasted`; `trainingScheduleToPrompt` vira o bloco ROTINA DE TREINO; `findTrainingWindowIssues` reprova pós-treino fora da janela e pré-treino para quem treina em jejum. Sem `MIN_SESSIONS` sessões devolve `null` e o prompt fica em silêncio — horário inventado com cara de fato é pior que horário nenhum. **Duas armadilhas, as duas provadas por mutação:** (1) `completed_at` é UTC e o usuário treina em São Paulo — comparar hora crua erra por 3 h e joga o café na madrugada; (2) o jejum tem que casar refeição e treino **pelo dia-calendário** — no pool global, um único café às 5h21 (24/07, o único dia em que ele comeu antes) marca as 12 sessões como "comeu antes" e inverte o resultado.

**Fase da dieta ≠ objetivo de treino.** `preferences.nutritionPhase` (CUT/MAINTAIN/BULK) é a INTENÇÃO nutricional, escolhida no painel ⚙ Metas; `fitnessGoal` é o objetivo de TREINO. Eram colapsados num só: quem marcava "hipertrofia" recebia BULK (+10% kcal) para sempre, sem ter pedido superávit. Fonte única em `lib/nutrition/phase.ts` (`resolveNutritionPhase` — fase explícita > fitnessGoal, para não mudar a meta de quem já usa o app). `mapFitnessGoal`/`mapGender`/`mapActivityLevel` vivem SÓ lá: já estiveram duplicados entre página e overlay e divergiram (source-guard trava a re-duplicação).

## ⚠️ Editor de Story — três elementos, três espaços, e uma armadilha de canvas

`StoryComposer`/`NutritionStoryComposer`/`CardioStoryComposer` compartilham `useStoryComposer` + os mesmos sub-componentes. **Mexeu num, confira os três** — o padrão aqui é componente único (`BrandDragHandle`, `AlignmentGuides`, `CustomTextDragHandle`, `CustomTextPanel`) justamente para não replicar 3× e divergir.

Três elementos independentes sobre a foto/vídeo: a **marca** (IRONTRACKS), a **legenda** do usuário (`customText.ts`) e o **bloco** (título + cards, movido por `workoutTransform`).

**A armadilha que custou um bug (03/08/2026):** `enterBrandSpace` desfaz o transform do bloco porque a MARCA é desenhada DENTRO dele. A LEGENDA não é — os renderers a desenham depois do `ctx.restore()` que encerra aquele transform. Copiar a inversa para ela deslocava o texto pelo NEGATIVO do pan do bloco: com o bloco arrastado, a legenda sumia da tela **enquanto a alça (HTML) continuava no lugar certo**. Sintoma: traçado visível, texto invisível.

**Caixa de elemento = TINTA, não em-box.** `measureBrandBox`/`measureCustomTextBox` usam `actualBoundingBoxAscent/Descent` e devolvem `dx`/`dy` (âncora → canto do traçado). Com `textBaseline='top'` o ponto de desenho é o topo da em-box e as maiúsculas começam abaixo — ancorar ali deixa um vão visível. **A alça e o hit-test do gesto usam o MESMO retângulo**; divergir faz o usuário mirar num lugar e acertar outro.

**Alças em % do CANVAS, nunca px de tela.** `marginLeft: '-6px'` somado a `width` em % do canvas valia 14,4px de canvas numa preview de ~300px — e mudava com o tamanho do preview.

**O EXPORT lê tudo por REF** (`renderComposite`). Já esqueceu `brandScale` uma vez: a escala da marca aparecia na prévia e SUMIA no arquivo salvo. Campo novo no desenho = adicionar ali também, senão só a prévia mostra.

**Ciclo de import:** `customText.ts` REPETE `CANVAS_W/H`/`SAFE_SIDE` de propósito — `storyComposerUtils` importa o desenho de lá, e importar de volta faria as constantes (lidas no topo) chegarem `undefined`, virando NaN na âncora e sumindo a legenda SEM erro. Guard trava a igualdade.

**Gestos:** o gesto pertence a quem ele NASCE em cima (`isPointOverBrand`) — sem isso a pinça no logo escalava o story inteiro, porque o 2º dedo cai fora da caixa pequena da marca e o overlay assumia. Guias de alinhamento (`snapBrandToCenter`) grudam no centro; no BLOCO o alvo é o offset ZERO (ele não tem caixa estável — cada layout desenha em coordenadas próprias) e só o eixo X acende linha, porque a altura de repouso dele não é o meio da tela.

**Treino em dupla** (atrás da flag `featureTeamworkV2`) — ⚠️ **AS TABELAS NÃO EXISTEM NO BANCO (verificado 02/08/2026; reconfirmado 04/08/2026 — `information_schema` segue sem `invites`/`team_sessions`/`team_session_presence`/`team_chat_messages`).** `information_schema` não retorna NADA com "team"/"invite" em nenhum schema, e a RPC `can_view_team_session` também sumiu. O código, os hooks e a flag continuam no repo (1 conta com a flag ON), mas em produção a feature quebra com "relation does not exist" — ela não pode estar funcionando. Suspeita não confirmada: perda na reescrita de histórico do repo (a mesma que fechou os PRs #323/#336 e gerou os recriados #505/#506). **Antes de mexer em qualquer coisa dessa área, investigue as migrations e descubra quando/por que as tabelas saíram — não recrie de memória a partir deste parágrafo.** O PR #506 (tornar o canal `team_logs` privado) foi FECHADO sem merge — a armadilha que o bloqueava continua de pé para quem tentar de novo: marcar `private: true` sem as policies de `realtime.messages` — que também não existem — derruba o sync em vez de protegê-lo. A descrição abaixo é o desenho ORIGINAL da feature, mantido como referência do que deveria existir: `contexts/TeamWorkoutContext.tsx` compõe os hooks de `contexts/team/*` (invites/session/presence/broadcast). Tabelas c/ RLS e na publication realtime: `invites`, `team_sessions`, `team_session_presence`, `team_chat_messages`. RPCs SECURITY DEFINER: `accept_team_invite`, `leave_team_session`, `can_view_team_session`. Participantes são gravados como `{uid,name,photo}` no banco mas lidos como `{user_id,display_name,photo_url}` no cliente → **sempre use `normalizeParticipant`** (`contexts/team/types.ts`). Sync ao vivo é **broadcast efêmero** do Supabase (sem replay — perde eventos se o parceiro fica em background). Máx. 5 participantes (`MAX_TEAM_PARTICIPANTS`, host incluso).

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

**Feature flags:** `utils/featureFlags.ts` (`isFeatureEnabled(settings, FEATURE_KEYS.x)`), guardadas em `user_settings.preferences` (default = desligado, salvo override explícito).

**VIP/pagamentos:** o status VIP NÃO é uma flag persistida — é **derivado em tempo de leitura** por `getVipPlanLimits` (`utils/vip/limits.ts`), em 3 camadas: `profiles.role` (admin/teacher → elite) → `user_entitlements` (fonte de verdade, expira sozinho por `valid_until`) → `app_subscriptions` (fallback legado, filtra `current_period_end`). **Toda escrita de status passa por service-role** (webhook RevenueCat, `revenuecat/sync`, checkout usam `createAdminClient`); o client autenticado só tem SELECT — nunca reintroduzir policy/GRANT de INSERT/UPDATE nessas tabelas pro usuário (foi a brecha de self-grant corrigida em 2026-07-11, migration `lock_down_vip_self_grant_and_usage`). Cotas de IA são contabilizadas SÓ pelos RPCs `SECURITY DEFINER` `increment/decrement_vip_usage_daily` — `vip_usage_daily` também é read-only pro client. Webhook autentica em tempo constante (`safeEqual`) e reconfirma o entitlement na API do RevenueCat antes de conceder.

## Gotchas específicos deste repo
- **Git worktrees NÃO têm `node_modules`.** Pro ESLint num worktree, aponte pro binário do repo principal: `node --import tsx "<repo-principal>/node_modules/eslint/bin/eslint.js" --config eslint.config.mjs <arquivos> --max-warnings 0`. Pra build iOS num worktree, rode `npm ci` NO worktree antes — **NÃO** faça symlink pro `node_modules` do main (conflito de versão no grafo SPM do iOS).
- **Supabase project id:** `enbueukmvgodngydkpzm` (via MCP `mcp__supabase__*`).
- **Chave Gemini: conta PAGA, e é a MESMA de produção.** Corrigido pelo dono em 01/08/2026 — esta nota dizia "free tier, 20 req/dia" e isso está **obsoleto**. Não há mais o teto diário que derrubou a Avaliação por Foto em 31/07/2026, então medição empírica contra a API não trava as features dos usuários. O que continua valendo: a chave é compartilhada com produção e **cada chamada custa dinheiro** — o cuidado agora é com CUSTO, não com cota. `gemini-pro` (usado no protocolo de exames, que cruza 4 fontes) é caro; use o `fastModelId` onde couber. Diagnóstico de IA em produção: runtime logs da Vercel (MCP `get_runtime_logs`). O gap "Sentry não recebe erro de rota server" foi CORRIGIDO em 02/08/2026 — causa: `captureException` só enfileira e a Vercel congela a instância antes do envio; `lib/logger.ts` agora agenda `Sentry.flush` via `waitUntil` (guard em `loggerServerFlush.test.ts`). Se o Sentry voltar a ficar mudo para rotas server, comece por lá.
- **Versão iOS:** `ios:release` só bumpa o build number (`CURRENT_PROJECT_VERSION`). A **versão pública (`MARKETING_VERSION`) é bumpada à mão** no `project.pbxproj` (**10 ocorrências** hoje — confira com `grep -c`, não confie no número) antes de um release novo. Ver "iOS — release" pra saber QUANDO ela precisa subir.
- **App Store Connect API — está TUDO no repo, não peça ao dono.** Chave em `~/.appstoreconnect/keys/AuthKey_W834H36CBM.p8`; `ASC_KEY_ID` e **`ASC_ISSUER_ID` no `.env.local`**, lidos sozinhos por `scripts/ios-submit.mjs` (submete pro review sem painel web; `--dry-run` primeiro). Esta linha dizia "o Issuer ID não fica no disco (pegar no painel)" e **estava errada** — em 03/08/2026 o agente acreditou, parou o trabalho e foi pedir ao dono um dado que estava a um `grep` de distância, com o script de submissão pronto ao lado. Detalhes em `docs/ios-release.md`.

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
treino em dupla — vale suspeitar dele em qualquer "isso deveria existir e não
existe" datado de fev–mar/2026.

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

**Mover para `src/middleware.ts` é decisão do dono** e merece tarefa própria: liga
de uma vez o refresh de sessão, o atalho `/` → `/dashboard` e um CSP com nonce por
request, em cima de usuários reais. Um CSP que nunca rodou em produção quebra
terceiros silenciosamente (Sentry, Vercel Analytics, RevenueCat) — vai de
`Content-Security-Policy-Report-Only` primeiro, não direto no modo bloqueante.

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

## Guard falso — os cinco jeitos de errar que já aconteceram aqui

Todo guard deve ser provado por mutação (vermelho com o bug, verde sem). Padrões que passaram verdes COM o bug presente:

1. **Tautológico** — assertar `toBe(MIN_MINI_SETS)` em vez do literal `2`: baixar a constante muda a expectativa junto.
2. **Acusando o próprio comentário** — source-guard que procura o padrão proibido e casa com a documentação que explica por que ele é proibido. Reduza ao código executável (fora comentário, string, template, regex) antes de casar.
3. **Cobrindo as pontas e não a fiação** — algoritmo e coletor corretos isoladamente, e ninguém ligando os dois. Foi assim que remover `knownWeights` da chamada no hook deixou 198 testes verdes.
4. **Proibindo o consumo CORRETO** — source-guard mirando o NOME do campo (`bodyWeightKg`…) em vez da FONTE: `p.bodyWeightKg` vindo do leitor único é exatamente o certo, e o guard reprovava. Mire em quem LÊ a tabela, não em quem usa o dado (ago/2026, `userSnapshot`).
5. **O teste que não existe** — declarar "provado por mutação" sem conferir que o caso foi mesmo inserido no arquivo. Um `replace` de script que não casa deixa o teste fora, e a mutação passa verde porque **nada** o exercita. Rode `vitest -t "<nome do caso>"` e confirme `1 passed`, não `0 passed | N skipped`.

## Checklist obrigatório antes de declarar qualquer tarefa concluída
1. **TypeScript:** `npx tsc --noEmit` — zero erros, sem exceção.
2. **ESLint (comando exato):** `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs <arquivos_editados> --max-warnings 0` — output vazio = limpo. Em worktree, ver Gotchas.
3. **`npm run test:unit`** se tocou lógica de negócio; **`npm run test:smoke`** se tocou rotas ou APIs.

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

**Escrita para conferir tela na conta de teste é aceitável se for reversível e
desfeita na hora.** Em 10/08 lancei "150g frango + 100g arroz" para ver o card de
Lançamentos (a conta não tinha refeição no dia) e removi em seguida, deixando a
conta como estava. Vale para nutrição; **não vale para treino** — ali a regra do X →
Confirmar continua, finalizar polui o `reportHistory` que alimenta o autoload.

| | `djmkbrasil` (TESTE, no simulador) | `djmkapple` (OFICIAL, o dono treina nela) |
|---|---|---|
| `user_id` | `6cb619ba-1484-41f2-b60c-b67aaea06307` | `d04bfcef-54ea-4360-9e3d-e174a9ace503` |
| Templates | 6 (A–F) | 5 |
| Sessões concluídas | **1** (`D - e teste`, notes vazio) | **127** |
| Meta em `nutrition_goals` | **nenhuma** | 2676 kcal · P208 C295 G74 |
| Fase / perfil | sem fase, perfil ~20% | CUT, perfil completo |

**Como identificar rápido:** a de teste mostra 6 treinos (A–F) e o aviso "Complete seu
perfil"; a oficial tem 5 e não mostra. O peso do check-in NÃO serve — aparece nas duas.

**O erro concreto, para não se repetir:** em 09/08/2026 um agente leu "0kg levantados"
e "Meta: 2000 kcal" na tela do simulador, consultou o banco de `djmkapple` (2,4 M kg,
2676 kcal) e concluiu que havia dois bugs graves. **Não havia nenhum**: a conta de teste
tem 1 sessão vazia e zero metas salvas, então os dois números estavam CERTOS. Custou uma
investigação inteira de RLS, RPC e policies atrás de fantasma. Ler a tela de uma conta
contra o banco de outra não é imprecisão — inverte a conclusão.

**A página `/dashboard/nutrition` NÃO é alcançável dentro do app nativo.** A aba NUTRIÇÃO do dashboard abre o `NutritionOverlay`, que é outro componente; o `VipHub` até tem `router.push('/dashboard/nutrition')`, mas só quando `onOpenNutrition` não é passado — e no dashboard ele é. A página é a superfície WEB. Mexeu nela? A conferência visual pelo simulador não existe: valide pelo overlay (irmão que exibe os mesmos números) ou pelos dados, e **diga que a prova foi numérica, não visual**.

**Teste de canvas NÃO prova rendering.** jsdom não implementa `canvas.getContext('2d')`, então `measureText`/matrizes caem em fallback e o teste passa verde com o desenho quebrado. Foi assim que a legenda do Story subiu com 23 guards verdes e o texto invisível no aparelho. Em qualquer coisa que DESENHE, o guard cobre o algoritmo e a fiação; o resultado na tela é conferência visual — declare o limite no próprio arquivo de teste.

**REGRA DO DONO (03/08/2026): toda mudança que precise de verificação VISUAL termina
no simulador iOS — abrir, navegar até a tela e conferir com screenshot.** Não vale
entregar UI descrevendo o que deveria aparecer, nem substituir a conferência por
mock/teste de render (eles provam comportamento, não o resultado na tela). **Device
padrão: iPhone 17 Pro Max** — é o aparelho do dono; só usar outro se ele pedir.

**O simulador mostra PRODUÇÃO, não o seu código local.** `capacitor.config.ts` tem
`url: process.env.CAPACITOR_SERVER_URL || 'https://irontracks.com.br'`, então o app
nativo carrega o front do servidor remoto. Consequências práticas:
- **Depois do merge**, o simulador confere a mudança de verdade, sem `.env.local` e
  sem rebuild — basta relançar o app. É o caminho barato e o default.
- **Antes do merge**, é preciso `CAPACITOR_SERVER_URL=<url do preview da Vercel>` +
  `npm run cap:sync` + build nova. Só vale quando o risco de mergear errado é alto.
- Um `.app` já instalado serve para qualquer mudança **web/JS** — não rebuilde à toa.

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

**⚠️ SEMPRE CANCELAR o treino de teste — NUNCA finalizar.** O simulador loga numa conta REAL (dados de produção). Finalizar grava um treino falso no histórico do dono e polui o `reportHistory` que alimenta o autoload. Usar o **X → Confirmar** ("não salva no histórico"). O mesmo vale pra qualquer escrita: preferir fluxos reversíveis.

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

Aconteceu em 31/07/2026 (1.18 → 1.19). Se for subir build e a versão atual já estiver publicada, bumpe a `MARKETING_VERSION` ANTES — evita um ciclo inteiro de archive perdido (~5 min).

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

## Notas de dados (evitar re-exploração cara do banco)
- **Histórico de treino / evolução de carga**: os pesos por série de sessões concluídas NÃO estão em `sets`/`exercises` (vazias p/ concluídos) — ficam no JSON de `workouts.notes`, no objeto `logs` ("exIdx-setIdx" → weight/reps/rpe). Mapa completo + SQL pronto + user IDs + project_id em **`docs/DATA_MAP_workout_history.md`**. Ler esse arquivo antes de consultar o banco sobre treino/carga.

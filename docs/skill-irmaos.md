# `/irmaos` — quem MAIS precisa mudar quando você mexe aqui

## Por que existe

A dor nº 1 deste repo, medida em 09/09/2026: o `CLAUDE.md` menciona **"fonte
única" 22 vezes**, e as frases "os quatro", "os DOIS" e "as DUAS" aparecem **6
vezes cada**. No mesmo dia, três correções tropeçaram nisso — os blocos de
cardio existiam só num dos dois editores, o toast de status estava duplicado nos
dois painéis de story (e por isso a correção de 01/09 alcançou só um), e o tipo
do rascunho de exercício estava escrito à mão em cinco lugares.

O mapa dessas famílias **existe**, mas está disperso em 3.900 linhas de
`CLAUDE.md`. Depender de o agente lembrar é o que produz o defeito. Esta skill
transforma "eu lembro" em "eu consulto".

⚠️ **A pergunta que ela responde não é "o que este arquivo faz?" — é "quem mais
tem que mudar junto?".**

## Como usar

```
/irmaos src/components/stories/StoryControlPanel.tsx
/irmaos buildDeloadPatches
/irmaos "peso por série"
```

## Protocolo

### Fase 1 — consultar o registro ANTES de procurar
Rode nesta ordem, e **pare quando a resposta aparecer**:

```bash
grep -n "<arquivo ou símbolo>" CLAUDE.md
grep -rn "<símbolo>" docs/*.md
```

O `CLAUDE.md` já descreve a maioria das famílias, com o motivo e o guard. Achou?
Responda com o que está escrito e **não meça de novo** — é a regra nº 7 de
economia do dono ("achado que já é nota não é achado: é leitura que faltou").

### Fase 2 — as famílias conhecidas (tabela viva)

Confira a tabela abaixo. Se o alvo cai numa linha dela, a resposta está pronta.

| se você mexe em… | mexa TAMBÉM em | guard que cobra |
|---|---|---|
| **campo por série** (`per_set_method` e afins) | **8 escritores** (rota de update, ações de servidor, editor completo, sync professor→aluno, clone de admin, periodização, payload do professor, backup) **+ 4 SELECTs de leitura** | `lib/workout/perSetMethodField.ts` (guard de classe) |
| **story: qualquer coisa visual** | **4 composers** (treino, nutrição, cardio, métricas) **+ 2 painéis** (`StoryControlPanel`, `NutritionStoryControlPanel`) | `stories/__tests__/acoesAlcancaveis.test.ts` |
| **story: campo novo no desenho** | o desenho **e** o `renderComposite` (export lê tudo por ref) | `exportLeTudoPorRef.test.ts` |
| **calorias da sessão** | `reportMetrics` (React) **e** `utils/report/buildHtml.ts` (PDF) — geradores separados | `sessionKcalInputs.test.ts` |
| **ingredientes da kcal** | fonte única `utils/calories/sessionKcalInputs.ts` — **7 chamadores**, tipo *branded* para impedir objeto literal | source-guard do 2º argumento |
| **check-in exibido** | a **tela** (`ReportCheckinPanel`) **e** o **PDF** (`buildCheckinSectionHtml`) | `checkinTelaEPdfNaoDivergem.test.ts` |
| **plano alimentar: campo novo** | quem **normaliza** (`parseMeal`/`planDays`) **e** quem **tipa** (`PrescribedDietPlan`) — o parser DESCARTA campo não declarado e a rota de swap REGRAVA | `notaDaRefeicao.test.ts` (ciclo ler→regravar→ler) |
| **método de série avançado** | o molde único `AdvancedSetRow` — **não** os 11 arquivos | `moldeUnicoAvancado.test.ts` |
| **peso editável com autoload** | os **14 renderers**, via `setUserWeight()` do `useAutoloadWeight` | `pesoEditavelComAutoload.test.tsx` |
| **fronteira de semana** | `utils/cron/weekRangeBrt.ts` — nunca calcular à mão | `semanaComecaNoDomingo.test.ts` ⚠️ tem ponto cego (variável intermediária) |
| **"já treinou hoje?"** | `lib/workout/trainedToday.ts` | — |
| **dados do usuário** | `lib/user/snapshot.ts` (leitor único) + ratchet de quem ainda lê `user_settings` | `userSettingsReadRatchet.test.ts` |
| **cor de macro** | `lib/nutrition/macroColors.ts` | `nutritionEntryCard.test.tsx` |
| **rótulo/cor de status de aluno** | `lib/admin/studentStatus.ts` | — |
| **nome de modelo Gemini** | `utils/ai/modelRegistry.ts` — em nenhum outro lugar | source-guard de classe |
| **rota de IA que exige JSON** | contrato na CHAMADA (`responseSchema`) + normalizador + Zod | `structuredOutputRatchet.test.ts` |
| **tabela nova no banco** | catálogo LGPD `lib/account/userDataCatalog.ts` (export **e** delete) | ⚠️ compara com uma FOTO (`PROD_TABLES_SNAPSHOT`) — re-rodar o SQL do cabeçalho |
| **salvar arquivo no iPhone** | `utils/report/exportHtmlAsPdf.ts` — `window.print()` não existe no WKWebView | `exportHtmlAsPdf.guard.test.ts` |
| **kcal de treino do dia** | `lib/nutrition/kcalDeTreinoDoDia.ts` (a QUERY mora lá, não só a soma) | guard de classe + fiação |
| **notificação: tipo novo** | `TYPE_CONFIG` **e** `DESTINO_POR_TIPO` | — |
| **nutrição: meta/tela** | as **DUAS** superfícies (`/dashboard/nutrition` e `NutritionOverlay`) | — |
| **blocos de cardio** | `ExerciseEditor/CardioBlocosEditor` — editor completo **e** modal rápido | `cardioBlocos.test.ts` |
| **recomendação de check-in** | `lib/workout/checkinRecommendations.ts` (tela e PDF consomem o resultado pronto) | — |

### Fase 3 — quando NÃO está na tabela

Só então varra, e **pelos dois ângulos** (regra de 27/08/2026 — cada um sozinho
deixa passar o que o outro pega):

1. **o que o código CHAMA** — `grep -rn "<símbolo>" src`
2. **o que o defeito PARECE** — a forma visual/estrutural (as classes, o JSX, a
   assinatura da query)

Foram 11 superfícies num caso real; nenhuma busca sozinha teria fechado.

### Fase 4 — a resposta

Entregue **uma lista de arquivos com o motivo de cada um**, e diga
explicitamente quando a família é maior que o escopo pedido — scaling down é
decisão do dono, não sua.

**Achou família nova?** Acrescente a linha nesta tabela na MESMA tarefa. Mapa que
não é atualizado vira o `CLAUDE.md` disperso de novo — que é o problema que esta
skill existe para resolver.

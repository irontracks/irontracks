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

**Falha muscular (`log.failure`) alimenta o motor, não é só enfeite.** `suggestWeight` não progride a carga quando a última sessão foi à falha (`anyFailed`). O caminho é longo e já esteve QUEBRADO no meio: log → `useWorkoutDeload` monta `setFailures` no `ReportHistoryItem` → `buildHistorySets` repassa `failed` → motor. Até jul/2026 os dois últimos elos não existiam, então a trava nunca disparava e a carga subia após séries que estouraram. Exibição: `ReportExerciseCard` (marca + contagem) **e** `buildHtml.ts` (PDF) — os dois. **A flag é SEMPRE marcação manual do usuário** — Heavy Duty e Repetições Forçadas vão à falha por definição e deliberadamente NÃO a gravam: se gravassem, a carga congelaria no `topWeight` para sempre e o aluno nunca progrediria nesses métodos (decisão do dono, jul/2026; guard em `set-renderers/__tests__/failureIsManualOnly.test.ts`). Não confundir com `reps_failure`, que é a CONTAGEM de reps até falhar, coletada no modal desses dois.

**`useInputField` (`set-renderers/normalSet.tsx`) — zona de corrida.** Cada input de série tem estado LOCAL porque o ticker de 1s re-renderiza tudo e um input controlado perderia tecla. O efeito de sincronização com o valor externo já jogou fora valor digitado duas vezes: a guarda anti-descarte precisa considerar a **digitação** (`typedAtRef`), não só o blur — com `blurredAtRef` ainda 0, `Date.now() - 0` é gigante e a guarda não pega. Sintoma no device: "digito o RPE e some", só em campos unilaterais (o re-sync do autoload dispara um `updateLog` extra logo após a tecla).

**Bug intermitente que não reproduz: instrumente, não chute.** Padrão `logWarnRemote` (`lib/logger.ts`) = warning pesquisável no Sentry (≠ `logError`, que é exception). Foi assim que o "RPE some" saiu de fantasma pra corrigido em 24 h — o payload entregou a causa. Toda saída silenciosa em caminho crítico é bomba-relógio.

**Bi-Set / Super-Set / Tri-Set…** — `lib/workoutGroups.ts` (`buildExerciseGroups`) infere grupos por exercícios CONSECUTIVOS de mesmo método (sem schema novo). `ExerciseList` auto-alterna entre os membros ao concluir uma série; o descanso só pode rolar no **último membro do par** (o enunciado do método é "0s descanso entre eles"). **O run consecutivo é fatiado pelo TAMANHO do método** (`GROUP_METHOD_SIZE`: Bi-Set/Super-Set/Pré-/Pós-exaustão = 2, Tri-Set = 3; Giant-Set sem tamanho fixo) — sem isso, 4 Bi-Sets seguidos (= dois pares, caso real do treino de braço) viravam um grupo de 4 e o 2º exercício nunca descansava. Guards: `src/lib/__tests__/workoutGroups.test.ts` e `set-renderers/__tests__/groupMethodRest.test.tsx`.

**Sessões ficam em `workouts.notes`** (JSON serializado como TEXT), NÃO numa tabela de sessões. `workout_session_logs` está praticamente vazia em produção — **não confie nela**. Finalização: `useWorkoutFinish` → `buildFinishWorkoutPayload` (`src/lib/finishWorkoutPayload.ts`) → `POST /api/workouts/finish` (idempotente via `finish_idempotency_key` + lock Upstash). No finish, `buildReportMetrics` (`utils/report/reportMetrics.ts`) computa e grava `reportMeta` dentro do notes.

**Orçamento de payload das rotas quentes (histórico + bootstrap).** Como a sessão inteira mora em `workouts.notes`, qualquer rota que selecione essa coluna e repasse a linha crua serve centenas de KB sem parecer errada. O histórico já engordou assim uma vez (corrigido em ago/2026 por `utils/history/slimHistoryRow.ts` — a rota resume no servidor e o JSON completo é buscado sob demanda). Guards de CI: `utils/history/__tests__/historyPayloadBudget.test.ts` (teto de 450 B por linha de treino, allowlist de chaves, source-guard do `select`) e `app/api/dashboard/__tests__/bootstrapPayloadShape.test.ts` (allowlist de workout/exercise/set nos DOIS caminhos — RPC e fallback TS —, teto por template e source-guard das chaves do `jsonb_build_object` na migration mais recente da RPC). Fixtures realistas em `src/__tests__/fixtures/hotRoutePayloads.ts`. **Campo novo nessas rotas = teste vermelho de propósito**: é o pedido de revisão, não um falso positivo — atualizar a allowlist é uma decisão consciente. Dívida conhecida travada por ratchet: usuário SEM template cai no 2º branch do bootstrap (rota e RPC), que devolve "qualquer workout do user" — inclusive sessões concluídas com o `notes` inteiro.

**Calorias:** modelo MET em `utils/calories/metEstimate.ts` (`estimateCaloriesMet`) + wrapper `estimateSessionKcal` (lê o JSON de `workouts.notes`). Por exercício = rateio do total via `utils/calories/distributeKcal.ts`. Relatório React usa `reportMetrics`; o **PDF/compartilhamento é um gerador HTML separado** em `utils/report/buildHtml.ts` (`buildReportHTML`/`buildReportData`) — mexeu num, cheque o outro.

**Nutrição:** DUAS superfícies distintas — a página `/dashboard/nutrition` (`NutritionMixer`) e o `NutritionOverlay` (a aba NUTRIÇÃO do dashboard). Ambas derivam a meta de `nutrition_goals` (salvo) ou do TDEE do perfil (`user_settings.preferences`). Ao mexer em meta/nutrição, ajuste as DUAS.

**Treino em dupla** (atrás da flag `featureTeamworkV2`) — ⚠️ **AS TABELAS NÃO EXISTEM NO BANCO (verificado 02/08/2026).** `information_schema` não retorna NADA com "team"/"invite" em nenhum schema, e a RPC `can_view_team_session` também sumiu. O código, os hooks e a flag continuam no repo (1 conta com a flag ON), mas em produção a feature quebra com "relation does not exist" — ela não pode estar funcionando. Suspeita não confirmada: perda na reescrita de histórico do repo (a mesma que fechou os PRs #323/#336 e gerou os recriados #505/#506). **Antes de mexer em qualquer coisa dessa área, investigue as migrations e descubra quando/por que as tabelas saíram — não recrie de memória a partir deste parágrafo.** Bloqueia o PR #506 (tornar o canal `team_logs` privado): marcar `private: true` sem as policies de `realtime.messages` — que também não existem — derruba o sync em vez de protegê-lo. A descrição abaixo é o desenho ORIGINAL da feature, mantido como referência do que deveria existir: `contexts/TeamWorkoutContext.tsx` compõe os hooks de `contexts/team/*` (invites/session/presence/broadcast). Tabelas c/ RLS e na publication realtime: `invites`, `team_sessions`, `team_session_presence`, `team_chat_messages`. RPCs SECURITY DEFINER: `accept_team_invite`, `leave_team_session`, `can_view_team_session`. Participantes são gravados como `{uid,name,photo}` no banco mas lidos como `{user_id,display_name,photo_url}` no cliente → **sempre use `normalizeParticipant`** (`contexts/team/types.ts`). Sync ao vivo é **broadcast efêmero** do Supabase (sem replay — perde eventos se o parceiro fica em background). Máx. 5 participantes (`MAX_TEAM_PARTICIPANTS`, host incluso).

**Dashboard shell:** `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx` é o client component central; navega por estado `view` ('dashboard'|'active'|'edit'|'assessments'|'community'|'vip'). Boot: `/api/dashboard/bootstrap` (RPC `get_dashboard_bootstrap`) + `useBootstrap` + `useWorkoutFetch`. **Toda hidratação da lista de treinos (SSR inicial, bootstrap, refetch) deve ordenar por `sortWorkoutsByOrder`** (`utils/mapWorkoutRow.ts`) — senão a lista pisca desordenada.

**Saída de IA: structured output + "normalize, depois valide".** Pedir JSON só no TEXTO do prompt e validar com Zod `.max()` NÃO funciona — medido em jul/2026 na Avaliação por Foto: 8 de 12 chamadas ao `gemini-2.5-flash` reprovavam no `safeParse` (JSON com `}` faltando; strings acima do teto, ex. `action` de 343 num limite de 300) e o usuário via "Não consegui gerar a correlação". Padrão correto, implementado em `utils/bodyPhoto/aiContract.ts`: (1) `responseMimeType: 'application/json'` + `responseSchema` na CHAMADA (derruba o JSON inválido a zero); (2) normalizador que TRUNCA (`utils/ai/coerce.ts`) — structured output não garante `maxLength`; (3) só então o schema estrito, como juiz. `utils/ai/extractJson.ts` ainda REPARA JSON quebrado (fonte única, beneficia todas as rotas). Os limites moram num só lugar (`LAUDO_LIMITS`/`CORRELATION_LIMITS` em `types/bodyPhotoAssessment.ts`) e alimentam Zod + responseSchema + normalizador. **As outras rotas de `api/ai/` ainda usam o padrão antigo** — mesma classe de falha, ainda não migradas.

**Feature flags:** `utils/featureFlags.ts` (`isFeatureEnabled(settings, FEATURE_KEYS.x)`), guardadas em `user_settings.preferences` (default = desligado, salvo override explícito).

**VIP/pagamentos:** o status VIP NÃO é uma flag persistida — é **derivado em tempo de leitura** por `getVipPlanLimits` (`utils/vip/limits.ts`), em 3 camadas: `profiles.role` (admin/teacher → elite) → `user_entitlements` (fonte de verdade, expira sozinho por `valid_until`) → `app_subscriptions` (fallback legado, filtra `current_period_end`). **Toda escrita de status passa por service-role** (webhook RevenueCat, `revenuecat/sync`, checkout usam `createAdminClient`); o client autenticado só tem SELECT — nunca reintroduzir policy/GRANT de INSERT/UPDATE nessas tabelas pro usuário (foi a brecha de self-grant corrigida em 2026-07-11, migration `lock_down_vip_self_grant_and_usage`). Cotas de IA são contabilizadas SÓ pelos RPCs `SECURITY DEFINER` `increment/decrement_vip_usage_daily` — `vip_usage_daily` também é read-only pro client. Webhook autentica em tempo constante (`safeEqual`) e reconfirma o entitlement na API do RevenueCat antes de conceder.

## Gotchas específicos deste repo
- **Git worktrees NÃO têm `node_modules`.** Pro ESLint num worktree, aponte pro binário do repo principal: `node --import tsx "<repo-principal>/node_modules/eslint/bin/eslint.js" --config eslint.config.mjs <arquivos> --max-warnings 0`. Pra build iOS num worktree, rode `npm ci` NO worktree antes — **NÃO** faça symlink pro `node_modules` do main (conflito de versão no grafo SPM do iOS).
- **Supabase project id:** `enbueukmvgodngydkpzm` (via MCP `mcp__supabase__*`).
- **Chave Gemini: conta PAGA, e é a MESMA de produção.** Corrigido pelo dono em 01/08/2026 — esta nota dizia "free tier, 20 req/dia" e isso está **obsoleto**. Não há mais o teto diário que derrubou a Avaliação por Foto em 31/07/2026, então medição empírica contra a API não trava as features dos usuários. O que continua valendo: a chave é compartilhada com produção e **cada chamada custa dinheiro** — o cuidado agora é com CUSTO, não com cota. `gemini-pro` (usado no protocolo de exames, que cruza 4 fontes) é caro; use o `fastModelId` onde couber. Diagnóstico de IA em produção: runtime logs da Vercel (MCP `get_runtime_logs`). O gap "Sentry não recebe erro de rota server" foi CORRIGIDO em 02/08/2026 — causa: `captureException` só enfileira e a Vercel congela a instância antes do envio; `lib/logger.ts` agora agenda `Sentry.flush` via `waitUntil` (guard em `loggerServerFlush.test.ts`). Se o Sentry voltar a ficar mudo para rotas server, comece por lá.
- **Versão iOS:** `ios:release` só bumpa o build number (`CURRENT_PROJECT_VERSION`). A **versão pública (`MARKETING_VERSION`) é bumpada à mão** no `project.pbxproj` (**10 ocorrências** hoje — confira com `grep -c`, não confie no número) antes de um release novo. Ver "iOS — release" pra saber QUANDO ela precisa subir.
- **App Store Connect API:** chave em `~/.appstoreconnect/keys/AuthKey_W834H36CBM.p8` (Key ID `W834H36CBM`); o **Issuer ID não fica no disco** (pegar no painel Users and Access → Integrations). Detalhes em `docs/ios-release.md`.

## Regra crítica: `npm run deploy` deve sempre funcionar
O deploy usa `husky` + `lint-staged` com **zero tolerância a warnings ESLint**. Qualquer warning bloqueia o commit e o deploy falha.

## Checklist obrigatório antes de declarar qualquer tarefa concluída
1. **TypeScript:** `npx tsc --noEmit` — zero erros, sem exceção.
2. **ESLint (comando exato):** `node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs <arquivos_editados> --max-warnings 0` — output vazio = limpo. Em worktree, ver Gotchas.
3. **`npm run test:unit`** se tocou lógica de negócio; **`npm run test:smoke`** se tocou rotas ou APIs.

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
**Regra fixa: o agente testa no simulador — não pede pro dono virar QA.** Build p/ simulador:
```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,id=<UDID>' -derivedDataPath /tmp/itsim-dd \
  CODE_SIGNING_ALLOWED=NO build
```
Depois instala o `.app` de `/tmp/itsim-dd/Build/Products/Debug-iphonesimulator/App.app`.

**⚠️ SEMPRE CANCELAR o treino de teste — NUNCA finalizar.** O simulador loga numa conta REAL (dados de produção). Finalizar grava um treino falso no histórico do dono e polui o `reportHistory` que alimenta o autoload. Usar o **X → Confirmar** ("não salva no histórico"). O mesmo vale pra qualquer escrita: preferir fluxos reversíveis.

**Limitação conhecida:** com `CODE_SIGNING_ALLOWED=NO` a extensão do widget não registra as `ActivityConfiguration` — o log mostra `activitykit … Fetched descriptors for content states: []` e **a Live Activity não renderiza no simulador**. Isso é do build, NÃO é regressão. Não tire conclusão sobre a Ilha Dinâmica a partir do simulador.

## ⚠️ Live Activity (Ilha Dinâmica + tela bloqueada) — ZONA DE NÃO MEXER
**Esta área já quebrou 12+ vezes, sempre EM SILÊNCIO.** Antes de tocar em qualquer coisa aqui, rode `npx vitest run src/hooks/__tests__/liveActivityRegressionGuards.test.ts` e `.../liveActivityTelemetry.test.ts`. Se um guard falhar, você está reintroduzindo uma regressão conhecida — **corrija o código, não afrouxe o teste.**

**Por que quebra sempre em silêncio:** os guards de plataforma (`if (!isIosNative()) return`) saem **sem reportar**. Aí nem Sentry nem teste veem nada — a feature morre e só o dono percebe, dias depois. Toda saída silenciosa nova nesse caminho é uma bomba-relógio.

**Os 3 vetores já corrigidos (não recriar):**
1. **Corrida do bridge** — `window.Capacitor` pode não estar injetado no 1º render da WebView. O efeito de start em `src/hooks/useWorkoutLiveActivity.ts` **precisa** depender de `nativeReady` (reavaliação) — nunca só de `[workoutStartMs]`, senão a LA nunca nasce.
2. **Limpeza de órfãs** — em `IronTracksAppClientImpl.tsx`, encerrar a LA assim que as settings carregam matava a activity recém-criada (`activeSession` chega async). **O atraso antes de `endWorkoutLiveActivity()` é obrigatório.**
3. **`load()` do plugin Swift** — ⛔ **INVESTIGADO E DESCARTADO. NÃO "CORRIJA".** Ele encerra todas as `Activity<RestTimerAttributes>`, e isso **está certo**: o `SceneDelegate` tem a trava `pluginRegistered`, então `load()` roda **uma vez por lançamento do app** (cold start) — NÃO a cada foreground nem em reload da WebView. No cold start o timer de descanso (JS) morreu junto com o app, então encerrar é o correto. Trocar por "só encerrar as vencidas" cria **Live Activities fantasma** contando sozinhas. Já foi analisado a fundo; não precisa de build.

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

Não é preciso pedir confirmação a cada PR — esta regra é a confirmação durável. Exceções em que o agente DEVE pedir antes de mergear:
- Mudança em `middleware.ts`, fluxos de auth, schemas do banco com migration, ou pagamentos (RevenueCat/IAP)
- CI vermelho ou flaky — investigar primeiro, não tentar contornar com `--no-verify` ou retry cego
- PR com revisões humanas pendentes não resolvidas

## Notas de dados (evitar re-exploração cara do banco)
- **Histórico de treino / evolução de carga**: os pesos por série de sessões concluídas NÃO estão em `sets`/`exercises` (vazias p/ concluídos) — ficam no JSON de `workouts.notes`, no objeto `logs` ("exIdx-setIdx" → weight/reps/rpe). Mapa completo + SQL pronto + user IDs + project_id em **`docs/DATA_MAP_workout_history.md`**. Ler esse arquivo antes de consultar o banco sobre treino/carga.

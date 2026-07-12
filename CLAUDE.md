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

**Sessões ficam em `workouts.notes`** (JSON serializado como TEXT), NÃO numa tabela de sessões. `workout_session_logs` está praticamente vazia em produção — **não confie nela**. Finalização: `useWorkoutFinish` → `buildFinishWorkoutPayload` (`src/lib/finishWorkoutPayload.ts`) → `POST /api/workouts/finish` (idempotente via `finish_idempotency_key` + lock Upstash). No finish, `buildReportMetrics` (`utils/report/reportMetrics.ts`) computa e grava `reportMeta` dentro do notes.

**Calorias:** modelo MET em `utils/calories/metEstimate.ts` (`estimateCaloriesMet`) + wrapper `estimateSessionKcal` (lê o JSON de `workouts.notes`). Por exercício = rateio do total via `utils/calories/distributeKcal.ts`. Relatório React usa `reportMetrics`; o **PDF/compartilhamento é um gerador HTML separado** em `utils/report/buildHtml.ts` (`buildReportHTML`/`buildReportData`) — mexeu num, cheque o outro.

**Nutrição:** DUAS superfícies distintas — a página `/dashboard/nutrition` (`NutritionMixer`) e o `NutritionOverlay` (a aba NUTRIÇÃO do dashboard). Ambas derivam a meta de `nutrition_goals` (salvo) ou do TDEE do perfil (`user_settings.preferences`). Ao mexer em meta/nutrição, ajuste as DUAS.

**Treino em dupla** (atrás da flag `featureTeamworkV2`): `contexts/TeamWorkoutContext.tsx` compõe os hooks de `contexts/team/*` (invites/session/presence/broadcast). Tabelas c/ RLS e na publication realtime: `invites`, `team_sessions`, `team_session_presence`, `team_chat_messages`. RPCs SECURITY DEFINER: `accept_team_invite`, `leave_team_session`, `can_view_team_session`. Participantes são gravados como `{uid,name,photo}` no banco mas lidos como `{user_id,display_name,photo_url}` no cliente → **sempre use `normalizeParticipant`** (`contexts/team/types.ts`). Sync ao vivo é **broadcast efêmero** do Supabase (sem replay — perde eventos se o parceiro fica em background). Máx. 5 participantes (`MAX_TEAM_PARTICIPANTS`, host incluso).

**Dashboard shell:** `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx` é o client component central; navega por estado `view` ('dashboard'|'active'|'edit'|'assessments'|'community'|'vip'). Boot: `/api/dashboard/bootstrap` (RPC `get_dashboard_bootstrap`) + `useBootstrap` + `useWorkoutFetch`. **Toda hidratação da lista de treinos (SSR inicial, bootstrap, refetch) deve ordenar por `sortWorkoutsByOrder`** (`utils/mapWorkoutRow.ts`) — senão a lista pisca desordenada.

**Feature flags:** `utils/featureFlags.ts` (`isFeatureEnabled(settings, FEATURE_KEYS.x)`), guardadas em `user_settings.preferences` (default = desligado, salvo override explícito).

**VIP/pagamentos:** o status VIP NÃO é uma flag persistida — é **derivado em tempo de leitura** por `getVipPlanLimits` (`utils/vip/limits.ts`), em 3 camadas: `profiles.role` (admin/teacher → elite) → `user_entitlements` (fonte de verdade, expira sozinho por `valid_until`) → `app_subscriptions` (fallback legado, filtra `current_period_end`). **Toda escrita de status passa por service-role** (webhook RevenueCat, `revenuecat/sync`, checkout usam `createAdminClient`); o client autenticado só tem SELECT — nunca reintroduzir policy/GRANT de INSERT/UPDATE nessas tabelas pro usuário (foi a brecha de self-grant corrigida em 2026-07-11, migration `lock_down_vip_self_grant_and_usage`). Cotas de IA são contabilizadas SÓ pelos RPCs `SECURITY DEFINER` `increment/decrement_vip_usage_daily` — `vip_usage_daily` também é read-only pro client. Webhook autentica em tempo constante (`safeEqual`) e reconfirma o entitlement na API do RevenueCat antes de conceder.

## Gotchas específicos deste repo
- **Git worktrees NÃO têm `node_modules`.** Pro ESLint num worktree, aponte pro binário do repo principal: `node --import tsx "<repo-principal>/node_modules/eslint/bin/eslint.js" --config eslint.config.mjs <arquivos> --max-warnings 0`. Pra build iOS num worktree, rode `npm ci` NO worktree antes — **NÃO** faça symlink pro `node_modules` do main (conflito de versão no grafo SPM do iOS).
- **Supabase project id:** `enbueukmvgodngydkpzm` (via MCP `mcp__supabase__*`).
- **Versão iOS:** `ios:release` só bumpa o build number (`CURRENT_PROJECT_VERSION`). A **versão pública (`MARKETING_VERSION`) é bumpada à mão** no `project.pbxproj` (6 build configs) antes de um release novo.
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

## iOS — release pra App Store / TestFlight
**REGRA FIXA do usuário: SEMPRE subir build pro App Store Connect via terminal, NUNCA abrir Xcode UI pra Archive/Distribute. Faz o claude perder tempão.**

```bash
npm run ios:release           # bump build atual+1, archive, upload pra TestFlight
npm run ios:release 25        # força build = 25
```

O script `scripts/ios-release.sh`:
1. Bumpa `CURRENT_PROJECT_VERSION` no `project.pbxproj` (todos os 6 build configs)
2. Roda `xcodebuild archive` (signing automático com cert "Apple Development: Maicon Benitz", team `5XLC55D3YR`)
3. Roda `xcodebuild -exportArchive` com `method=app-store-connect` + `destination=upload` — envia direto pra Apple

Em ~10 min depois aparece no TestFlight do iPhone do usuário. Auth reusa a session do Xcode em `Xcode → Settings → Accounts` (uma vez configurado, não pede de novo).

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

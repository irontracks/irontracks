# Plano de Modernização — React 19 + TanStack Query (IronTracks)

Plano em pt-BR, ~2400 palavras.

---

## 1. Audit do estado atual

### 1.1 Hooks de "fetch + cache" no projeto

Mapeamento de candidatos a `useQuery` (15 hooks em `src/hooks/`, mais 4 sub-hooks em `src/components/dashboard/nutrition/`). Em ordem de prioridade pela criticidade no caminho quente:

| Hook | LOC | Padrão atual | Bookkeeping manual |
|---|---|---|---|
| `useWorkoutFetch.ts` | 520 | `useState + useEffect + fetch+supabase`, 3x cache layers (localStorage por user, IDB via `cacheGetWorkouts`, fallback `/api/workouts/list`) | `isFetching` ref + cancelled flag + custom event listener |
| `useReportData.ts` | 603 | `useState + useEffect` para cardio GPS + AI cache | `kcalApiCalledRef`, `cardioWorkoutIdRef` |
| `useUserSettings.ts` | 199 | `useEffect` lê localStorage + Supabase, save manual | `lastSavedRef`, `tableMissingRef`, `cancelled` |
| `useBootstrap.ts` | 108 | `useEffect` único + fetch /api/dashboard/bootstrap | `cancelled` flag |
| `useVipCredits.ts` | 70 | AbortController + `useState(loading)` | `controllerRef`, `refresh` callback custom |
| `useTeacherPlan.ts` | 53 | `useCallback fetch` + `useEffect(fetch)` | refetch manual |
| `useStudentSubscription.ts` | 42 | mesmo do anterior | refetch manual |
| `useTeamStreak.ts` | 101 | `useCallback fetch` + Supabase + `useState(loading/error)` | refetch manual |
| `usePeriodizedWorkouts.ts` | 314 | fetch + dedupe interno | refetch handlers |
| `useAdminVipMap.ts` | ~70 | `prevKeyRef` para evitar re-fetch | refetch manual |
| `useAssessmentHistoryData.ts` | – | server action + state | – |
| `useMuscleMapWeek.ts` | 56 | server action `getMuscleMapWeek` + state | – |
| `usePreviousSessionData.ts` | – | server action + state | – |
| `useMuscleTrends.ts` | – | server action + state | – |
| `useWorkoutStreak.ts` | 79 | server action + state + cancelled flag | – |
| `useWhatsNew.ts` | 129 | `fetch + setState + mark-viewed` | `shownRef` |
| `useNutritionGoals` / `useCustomFoods` / `useFavoriteMeals` / `useNutritionEntries` | – | Supabase via `useStableSupabaseClient` ou `useMemo(()=>createClient(),[])` | manual |

Total estimado: **19 hooks** com server state + ~15 outros componentes carregando dados ad-hoc no corpo do componente.

### 1.2 Server Actions em `src/actions/`

- 6 arquivos: `admin-actions.ts`, `workout-actions.ts` (barrel re-export), `workout-ai-actions.ts`, `workout-analytics-actions.ts`, `workout-crud-actions.ts`, `workout-report-actions.ts`.
- **Apenas `admin-actions.ts:1` tem `'use server'`**. Os outros 4 arquivos com lógica são consumidos como módulos comuns importados do client — funcionam como "actions" no nome apenas, sem o runtime de Server Action do Next.js. Isso significa que `useActionState` hoje só seria 100% honesto em `admin-actions.ts`. Para o resto, ou (a) adicionamos `'use server'` em cada arquivo (gera Server Actions reais), ou (b) tratamos como funções async normais e usamos `useTransition`/`useOptimistic`.
- Consumers: ~24 arquivos importam de `@/actions/*`. Maioria via `useTransition`/`useState` manual.

### 1.3 `useOptimisticAction` — API e consumers

- Arquivo: `src/hooks/useOptimisticAction.ts:27-74`.
- **Consumers reais: zero.** Re-implementação manual preparada mas nunca adotada.
- Casos prioritários ainda implementam optimistic manualmente:
  - `StoryViewer.tsx:424-436` — `toggleLike`.
  - `useTeamInvites.ts:543` — `acceptInvite` (sem optimistic).
  - `NotificationCenter.tsx` + `AdminNotificationBell.tsx` — mark-read com debounce manual.

### 1.4 Forms críticos

- **`useLoginScreen.ts`** — 5+ states só de saving/feedback.
- **`useProfileSave.ts`** — `useState(savingProfile)` manual.
- **`ProfilePage.tsx`** — 3 states de status.
- **`AssessmentForm.tsx:224`** — `useState<'idle'|'saving'|'saved'>(autoSaveStatus)`.
- **`SettingsModal`** — `useUserSettings.save` com `useState(saving)`.
- **Check-in pré/pós treino** — `useState` para pending.

Todos onSubmit-handlers (sem `<form action={serverAction}>`), portanto `useFormStatus` não tem alvo natural sem migrar para `<form action>`.

---

## 2. Decisões arquiteturais

### 2.1 TanStack Query

- **Versão: v5.** Compatível com React 19 desde `5.40+`. v4 está em manutenção. Bundle gzip ~13KB.
- **Provider**: criar `QueryProvider.tsx` em `src/app/(app)/_providers/` e montar dentro de `src/app/layout.tsx` envolvendo `<main>` antes de `ToastProvider`.
- **DevTools**: `@tanstack/react-query-devtools` via dynamic import dev-only.
- **Persistência offline**: NÃO usar `persistQueryClient`. O projeto já tem `offlineSync.ts` (IDB + nativeFs Capacitor) e `localStorage` per-user. Manter essa camada e usar `initialData` + `placeholderData` no Query.
- **Hydration**: `dashboard/page.tsx` (Server Component) já passa `initialWorkouts`. Padrão: `useQuery({ initialData: initialWorkouts, staleTime: 30s, initialDataUpdatedAt: serverFetchedAt })`.

### 2.2 `use()` e Suspense

- **Granularidade**: por seção (Dashboard, History, WorkoutReport, Community, Nutrition). Granular demais gera waterfall.
- Hoje 4 boundaries: `IronTracksAppClientImpl:882`, `auth/recovery/page.tsx:23`, `auth/error/page.tsx:76`, `WorkoutReport.tsx`.
- **Manter `loading` states locais como fallback do Suspense**, não primário. Hooks migrados expõem `isPending`/`isFetching` do TanStack (compat).
- `use(promise)` pontual em AI insights no Report.

### 2.3 `useOptimistic` vs `useOptimisticAction`

- Zero consumers de `useOptimisticAction` — sem adapter. Estratégia: **deletar** + inserir `useOptimistic` nativo direto.
- Casos prioritários: `StoryViewer.toggleLike`, `useTeamInvites.acceptInvite`, mark notification read.
- Padrão recomendado: emparelhar `useOptimistic` com Server Action `'use server'` em vez de fetch a API route.

### 2.4 `useActionState` + `useFormStatus`

- **Migração para `<form action={serverAction}>`** apenas onde a action já tem `'use server'`. Necessário adicionar `'use server'` aos demais arquivos ANTES.
- **Forms candidatos SSR-friendly**: ProfilePage (display name, handle), Settings, Admin broadcast.
- **Manter client-side**: LoginScreen (Apple Sign-In Capacitor), check-in pré/pós (offline IDB), workout editor save, stories upload.

### 2.5 `useTransition` adicional

- `StudentsTab` (filtros pesados).
- `ExerciseEditor` (busca/swap).
- `HistoryList` (mudança de range).

---

## 3. Plano incremental — 7 PRs

### PR-A: Infraestrutura TanStack Query
**Arquivos novos**: `src/app/(app)/_providers/QueryProvider.tsx`, `QueryDevtools.tsx` (dynamic, dev-only).
**Arquivos tocados**: `package.json`, `src/app/layout.tsx`, `next.config.ts` (`optimizePackageImports`).
**Config**:
- `staleTime: 30_000`, `gcTime: 5*60_000`
- `refetchOnWindowFocus: false` (Capacitor — focus ruidoso)
- `retry: 2`
- mutations `onError`: `Sentry.captureException`
**Risco**: baixo. Provider noop até alguém usar `useQuery`.
**Testes**: `npm run build`, `npm run analyze` (esperar +12-14KB gz no chunk principal).

### PR-B: Migrar `useUserSettings` como piloto
**Objetivo**: validar arquitetura no menor hook útil (~199 LOC, 17 testes unit).
**Arquivos**: `src/hooks/useUserSettings.ts` reescrito com `useQuery` + `useMutation`. Mesma API pública.
**Risco**: médio — manter `tableMissingRef` fallback como decisor no `queryFn`.
**Testes**: unit + smoke E2E SettingsModal + manual com `localStorage` corrompido.

### PR-C: Migrar 4 hooks simples em paralelo
- `useVipCredits`, `useTeacherPlan`, `useStudentSubscription`, `useTeamStreak`.
- Padrão idêntico (fetch + setState + refetch callback).
- ~150 LOC de bookkeeping removidos.

### PR-D: Adicionar `'use server'` em todas as Server Actions
**Arquivos**: `workout-crud-actions.ts`, `workout-ai-actions.ts`, `workout-analytics-actions.ts`, `workout-report-actions.ts`. Barrel não precisa (re-export transitivo).
**Risco**: ALTO. Build valida serialização — pode falhar se houver `class` ou `Date` em payloads. Mitigação: Zod parse antes.
**Testes**: `npx tsc --noEmit`, `npm run build`, `npm run test:smoke`, manual de fluxos críticos.

### PR-E: Migrar `useWorkoutFetch` (520 LOC — alto risco)
**Estratégia**:
- `useQuery({ queryKey: ['workouts', userId, role], queryFn, initialData: ()=>readFromLocalStorage(userId) || initialWorkouts, staleTime: 60_000, networkMode: 'offlineFirst' })`
- Custom event `irontracks:workouts-changed` → `queryClient.invalidateQueries(['workouts'])`
- localStorage = `initialData` placeholder, IDB = fallback offline dentro do `queryFn`.
**Risco**: ALTO — caminho quente do app.
**Testes**: E2E `test-04-treinos`, `test-21-historico`, airplane-mode, teacher view com `studentFolders`.

### PR-F: Migrar `useReportData` + Suspense no WorkoutReport
**Mudanças**:
- Extrair fetch de `cardio_tracks` para `useQuery({ queryKey: ['cardio-track', workoutId] })`.
- Extrair kcal API log para `useMutation` fire-and-forget.
- Migrar `usePreviousSessionData`, `useMuscleTrends`, `useMuscleMapWeek`, `useWorkoutStreak` (consomem Server Actions já com `'use server'` após PR-D).
- Envolver panels (AI insights, Muscle map) em `<Suspense>` individuais.

### PR-G: `useOptimistic` + `useActionState` em forms simples + deletar `useOptimisticAction`
- `StoryViewer.toggleLike`: substituir pattern manual por `useOptimistic`.
- `useTeamInvites.acceptInvite`: `useOptimistic`.
- `NotificationCenter.markRead`: `useOptimistic`.
- `ProfilePage` save display_name: `<form action={updateProfileAction}>` + `useActionState` + `useFormStatus`.
- DELETAR `useOptimisticAction.ts` (zero consumers).

### PR-H (opcional, fase 2): `useTransition` + `useDeferredValue`
- StudentsTab filter, ExerciseEditor search, HistoryList date-range.

---

## 4. Riscos e mitigações

### 4.1 Quebra de comportamento offline
**Risco**: TanStack Query default não respeita `navigator.onLine`.
**Mitigação**: `networkMode: 'offlineFirst'` global. `placeholderData` via localStorage em queries críticas.

### 4.2 Hydration mismatch entre server initialData e client cache
**Mitigação**: `staleTime: 30_000` + `initialDataUpdatedAt: serverFetchedAt` carimbado no Server Component via `Date.now()`. Refetch só após 30s ou invalidação manual.

### 4.3 Stale data em treino ativo + Realtime
**Mitigação**: manter Realtime channels existentes (`useUnreadBadges`, `useTeacherControl`, `useStudentControlNotice`, `useSessionSync`). Disparam `queryClient.invalidateQueries(...)` ou `setQueryData` direto. Não combinar Realtime + Query no mesmo hook.

### 4.4 Bundle size (~12KB gz)
**Mensuração**: `npm run analyze` antes/depois.
**Esperado delta líquido**: +6 a +10KB gz no chunk principal após remover ~200 LOC de bookkeeping.

### 4.5 Migration do `useOptimisticAction`
Zero risco real (zero consumers).

### 4.6 `'use server'` em ações que recebem objetos não-serializáveis
**Mitigação**: serializar via Zod antes (padrão já adotado). Adicionar `parseJsonWithSchema` em pontos detectados durante PR-D.

### 4.7 React 19 + libs antigas
Nenhuma incompatibilidade conhecida com `useQuery` v5. React 19.2 pinado em `package.json`.

### 4.8 Reentrant subscription bugs
`useQuery` faz dedup nativa por queryKey — pode mascarar bugs de race. Testar login → logout → re-login.

---

## 5. O que NÃO modernizar

Tudo abaixo permanece como está:

1. **Capacitor IAP / RevenueCat** — device state, não server state.
2. **Sentry instrumentation** — sem mudança.
3. **Realtime channels** funcionais — manter, integrar como triggers de `invalidateQueries`.
4. **`useWatchBridge` / WatchConnectivity** — ponte nativa.
5. **`useGeoLocation` / Capacitor Geolocation** — side-effect.
6. **HealthKit / push notifications setup** — one-shot setup sem cache.
7. **`useStableSupabaseClient`** — resolve issue de createClient leak. **Expandir adoção**.
8. **Service Worker / PWA offline shell**.
9. **Forms com OAuth (LoginScreen Apple Sign-In)** — fluxo client-side necessário para Capacitor.
10. **`useActiveSession` + `useLocalPersistence`** — persistência de treino-em-andamento. Caminho ultra-crítico, manter offline-first.

---

## 6. Critérios de "feito"

### Quantitativos
- **70% dos hooks de fetch migrados** (13 de 19).
- **400+ LOC de bookkeeping removidas**.
- **Bundle delta**: aceitar até +15KB gz. Se passar, revisar code-splitting.
- **`useOptimisticAction.ts` deletado**.
- **`'use server'` em 5 dos 6 arquivos de actions**.
- **3+ instâncias de `useOptimistic`** (StoryViewer, acceptInvite, markRead).
- **1+ form com `useActionState` + `useFormStatus`** (ProfilePage).
- **Suspense boundaries**: pelo menos 3 novas (WorkoutReport panels).

### Qualitativos
- Zero regressão em `npm run test:unit` (1377 testes).
- Zero ESLint warnings (regra dura do projeto).
- `npm run test:smoke` verde.
- E2E completos (Playwright 16 specs) verdes.
- `npx tsc --noEmit` verde.
- `npm run analyze`: bundle delta documentado.
- Smoke manual no TestFlight (1 iOS + 1 Android) — manter offline-first em sessão ativa.

### Métricas opcionais (PR posterior)
- TTI do Dashboard (Vercel Speed Insights) antes/depois.
- Número de requests Supabase no caminho "login → dashboard" — dedup TanStack deve reduzir.

---

## Cronologia sugerida

| Semana | PRs |
|---|---|
| 1 | PR-A (infra) + PR-D (`'use server'`) em paralelo |
| 2 | PR-B (piloto `useUserSettings`) |
| 3 | PR-C (4 hooks simples) |
| 4-5 | PR-E (`useWorkoutFetch` — alto risco) |
| 6 | PR-F (`useReportData` + Suspense) |
| 7 | PR-G (`useOptimistic` + `useActionState`) |
| 8 | PR-H opcional + cleanup + métricas |

Total: ~7-8 semanas dev solo, ~4-5 com revisão paralela.

---

## Critical Files for Implementation

- `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/app/layout.tsx`
- `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useWorkoutFetch.ts`
- `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useUserSettings.ts`
- `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useReportData.ts`
- `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/actions/workout-crud-actions.ts`

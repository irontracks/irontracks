# PR#4a — Sub-rotas (history, active, report) — plano detalhado

Plano técnico pra completar o refactor do god component `IronTracksAppClientImpl`
substituindo `view: string` por roteamento real do Next.js App Router.

Status atual: **infraestrutura pronta**, falta executar.

## Pré-requisitos (já em produção)

- ✅ PR#0–#2: Zustand modalStore, DashboardEffects, DashboardProviders, modais usando store
- ✅ PR#3 base: `UserDataContext` criado em `_components/UserDataContext.tsx`
- ✅ TanStack Query infra (QueryProvider em `(app)/layout.tsx`)
- ✅ `useWorkoutFetch`, `useUserSettings`, `useReportData` (cardio+kcal) migrados pra Query

## Bloqueador #1 — Providers ainda dentro do client

`IronTracksAppClient` (god component) hospeda:
- `DialogProvider`, `InAppNotificationsProvider`, `WatchSyncProvider`, `TeamWorkoutProvider`

Se criarmos `(app)/dashboard/history/page.tsx` como sub-rota separada, ela
renderiza FORA dos providers acima → quebra. Workaround é mover providers
pra um `layout.tsx` compartilhado entre todas as sub-rotas.

### Passos de pré-PR

1. Criar `src/app/(app)/dashboard/layout.tsx` (Client) que envolve `{children}` com:
   ```tsx
   <DashboardProviders ...>
     <DashboardEffects userId={user?.id} onIntent={handleIntent} />
     <UserDataProvider value={userData}>
       {children}
     </UserDataProvider>
   </DashboardProviders>
   ```
2. Mover o estado/hooks de bootstrap (`useBootstrap`, `useWorkoutFetch`, `useUserSettings`,
   `useVipAccess`, etc) do `IronTracksAppClient` pra um Client Component em `layout.tsx`
   (ou um `DashboardBootstrap` headless invocado lá).
3. `dashboard/page.tsx` continua renderizando o `IronTracksAppClient` (que vira mais
   enxuto — só layout + view branching).

**Risco**: layouts Client em App Router têm restrições (não podem ser async). Solução:
`dashboard/layout.tsx` é Server Component que importa Client Component
`DashboardShell.tsx` que provê os contexts.

## Passos do PR#4a (após pré-PR)

### Sub-rota 1 — `/dashboard/history` (MAIS SIMPLES)

1. **Criar** `src/app/(app)/dashboard/history/page.tsx` (Server Component minimal)
2. **Criar** `src/app/(app)/dashboard/history/HistoryClient.tsx`:
   - `useDashboardData()` pra user, settings, vipStatus
   - Renderiza `<HistoryList>` com props derivados do context
   - `onBack` → `router.push('/dashboard')`
   - `onViewReport(session)` → setar reportData via context + `router.push('/dashboard/report/[id]')` (fase 2)
3. **Mudar** `useViewNavigation.handleOpenHistory`:
   ```ts
   const handleOpenHistory = useCallback(() => {
     try { fetch('/api/workouts/history?limit=50', { priority: 'high' }).catch(() => {}) } catch {}
     router.push('/dashboard/history')
   }, [router])
   ```
4. **Remover** o branch `{view === 'history' && <HistoryList ... />}` no
   `IronTracksAppClient` — rota cuida agora.
5. **Validar**: E2E `authenticated-history.spec.ts`, deep-link `irontracks://history`.

### Sub-rota 2 — `/dashboard/active` (CRÍTICA)

Depende de session state em memória. Plano:

1. Adicionar `activeSession` no `UserDataContext` (já está parcialmente).
2. **Criar** `dashboard/active/page.tsx` + `ActiveClient.tsx`.
3. `ActiveClient`: lê `activeSession` do context. Se null → `router.replace('/dashboard')`.
4. **Mudar** `useLocalPersistence`: restore-after-crash que chamava `setView('active')`
   agora faz `router.replace('/dashboard/active')`.
5. **Validar**: kill app mid-workout → reabrir → cair em `/dashboard/active`.

### Sub-rota 3 — `/dashboard/report/[sessionId]`

1. **Criar** `dashboard/report/[sessionId]/page.tsx`.
2. URL traz sessionId. Fetcha session se não houver em memória.
3. `reportData.current` pode vir de `UserDataContext` OU fetch via `/api/workouts/history/[id]`.

### Sub-rota 4 — `/dashboard/chat[/[channelId]]`

1. **Criar** `dashboard/chat/page.tsx` (ChatListScreen) e `dashboard/chat/[channelId]/page.tsx` (ChatDirect).

### Sub-rotas 5+ — `/dashboard/profile`, `/dashboard/admin`, etc

Pattern idêntico ao history.

## Riscos críticos

| Risco | Mitigação |
|---|---|
| Hydration mismatch (layout client + page client) | `'use client'` em ambos, evitar async em layout |
| `useLocalPersistence` restaura sessão na URL errada | testes E2E forçados: crash mid-workout → reopen → URL correta |
| Deep links iOS quebram (`irontracks://history`) | `useNativeDeepLinks` já usa `router.push` — só validar mapeamento |
| `usePathname()` em hooks que rodam fora do layout | usar `useEffect` pra detectar mudança e atualizar refs |
| Modais (StoryComposer, etc) abertos em /history voltam pra / | `useModalStore` é global, modal segue aberto cross-route |

## Critérios de "feito"

- [ ] Layout compartilhado em `dashboard/layout.tsx` Client
- [ ] 5+ sub-rotas funcionais (history, active, report/[id], chat, profile)
- [ ] `view: string` reduzido a fallback ou removido
- [ ] `useLocalPersistence` migrado pra `router.replace`
- [ ] E2E completos verdes
- [ ] Deep-links iOS validados manualmente
- [ ] `IronTracksAppClientImpl` < 400 linhas

## Cronograma

| Fase | Tempo estimado |
|---|---|
| Pré-PR: mover providers pra layout | 1-2h |
| Sub-rota history piloto | 30min |
| Sub-rota active (crítica) | 1-2h |
| Sub-rota report | 1h |
| chat + profile + admin | 1h |
| Limpeza final + testes E2E | 1-2h |
| **Total** | **5-8h dedicadas** |

Sessão Opus dedicada recomendada.

# IronTracks React Audit
Data: 2026-05-13

## Resumo executivo

- **WorkoutContext (durante treino ativo) é o maior gargalo de performance**: o controller retorna um literal de objeto não memoizado em `useActiveWorkoutController.ts:477`. Cada update de log (digitar peso/rep) cria novo `value` do Provider e re-renderiza TODOS os `ExerciseCard`/`NormalSet` filhos, anulando o `React.memo` do `ExerciseCard` (`ExerciseCard.tsx:549`). Em treino com 12 exercícios × 4 séries = 48+ componentes re-renderizando por tecla.
- **Listener leak por render em `useProfileCompletion`, `useAuthInit` e ~5 outros hooks**: chamam `createClient()` no corpo do render, criando uma nova instância de Supabase browser client (com seus listeners de storage) a cada re-render. `useAuthInit` agrava: a `useEffect` depende de `[supabase, ...]`, portanto a subscription `onAuthStateChange` é destruída e recriada a cada render. Felizmente esse hook é dead code (não é importado).
- **`useUnreadBadges.ts:117-174`** resubscreve o canal Realtime `direct-messages-badge:${userId}` toda vez que o usuário troca de view, porque `view` está nas deps mas é lido via uma constante `viewRef = { current: view }` que **não é um ref real** (objeto recriado a cada effect run). Trocar de "dashboard" → "history" mata e abre canal Supabase a cada click.
- **`createContext` providers passando objeto literal não memoizado**: `DialogContext.tsx:112`, `ToastContext.tsx:53`, e `InAppNotificationsContext.tsx:190` enviam `value={{...}}` fresco a cada render. Como `useDialog` é consumido em dezenas de lugares, qualquer setState dentro do provider re-renderiza toda a árvore consumidora.
- **`useTryToast` em `WatchSyncProvider.tsx:185-194` quebra Rules of Hooks**: chama `useToast()` dentro de `try/catch` para fallback gracioso. Se o ToastProvider sumir entre renders (improvável mas possível durante hot reload/erro), React perde ordem dos hooks e o app crasha.
- **`useGeoLocation.ts:445-453`** só limpa watchID de tipo `number` (web) no cleanup do unmount — IDs de string (Capacitor nativo) ficam órfãos, mantendo GPS ligado após sair da tela de cardio se o usuário matar o componente sem chamar `stopWatching`.
- **`WatchSyncProvider.tsx:160-165` re-empurra dashboard a cada render**: o array de deps inclui `watch` (objeto retornado por `useWatchBridge` que é fresco a cada render). Cada render do provider chama `watch.pushDashboard(dashboard)` via ponte nativa. Em sessão ativa onde dashboard muda a cada segundo, são chamadas constantes no bridge JS↔Swift.

## Findings (priorizados)

### 🔴 1. WorkoutContext sem memoização — anula React.memo de ExerciseCard
- **Severidade**: 🔴 crítico
- **Localização**: `src/components/workout/useActiveWorkoutController.ts:477-613`
- **O que é**: O hook retorna um objeto literal (`return { session, workout, exercises, logs, ... }`) sem `useMemo`. Esse retorno vira o `value` do `WorkoutProvider` em `ActiveWorkout.tsx:178`. Cada render do `ActiveWorkout` (e há vários disparadores — `useWorkoutLiveActivity` deps, `useTeamWorkout` deps, ticker de pausa) gera novo objeto.
- **Por que importa**: `ExerciseCard` é `React.memo`-ado (`ExerciseCard.tsx:549`), mas todo consumer de `useWorkoutContext()` re-renderiza quando `value` muda — e value muda toda vez. Os 50–80 componentes filhos (cards + renderers + inputs) re-renderizam em cascata a cada keystroke. Combinado com `NormalSet` sem `memo`, o custo cresce O(exercises × sets).
- **Sugestão de fix**: envolver o `return` em `useMemo` listando explicitamente as dependências mais voláteis. Alternativa mais sólida: dividir o WorkoutContext em 2-3 contextos menores — um "estado de leitura" (logs, exercises) e um "ações estáveis" (updateLog, toggleCollapse, etc) — assim os handlers ficam num provider que só muda quando refs mudam, e cards que só leem ações não precisam re-renderizar.

### 🔴 2. Listener leak — `createClient()` em corpo de hooks/componentes
- **Severidade**: 🔴 crítico
- **Localizações**:
  - `src/hooks/useProfileCompletion.ts:56` — `const supabase = createClient()` no corpo
  - `src/hooks/useAuthInit.ts:27` — mesmo padrão; dead code mas exemplo do anti-pattern
  - `src/components/dashboard/nutrition/useNutritionGoals.ts:19`
  - `src/components/dashboard/nutrition/useCustomFoods.ts:63`
  - `src/components/dashboard/nutrition/useFavoriteMeals.ts:14`
  - 56 ocorrências totais de `createClient()` em `src/` (ver `grep "createClient()"` em `src/components` + `src/hooks`)
- **O que é**: `createBrowserClient` (Supabase) não é singleton — cada call instancia um novo client com um listener interno em `window.addEventListener('storage', ...)` para sincronização de sessão entre abas. Chamado no corpo do render, isso acontece a cada re-render do componente/hook.
- **Por que importa**: leak de listeners + memória crescente durante sessões longas. Em treino ativo de 90 min, esses hooks são re-renderizados centenas de vezes. Cada renderização adiciona um listener que nunca é removido (a referência ao client é descartada mas o listener registrado no window persiste). O CLAUDE.md explicitamente proíbe esse padrão para Firestore mas o mesmo se aplica aqui.
- **Sugestão de fix**: já existe `useStableSupabaseClient` em `src/hooks/useStableSupabaseClient.ts` que faz `useState(() => createClient())`. Trocar todos os calls em corpo de hook para `const supabase = useStableSupabaseClient()`, ou no mínimo `const supabase = useMemo(() => createClient(), [])`. Idealmente, ter um único `SupabaseClient` por sessão exposto via Context — hoje há 3-4 instâncias paralelas mesmo no caminho feliz.

### 🔴 3. `useUnreadBadges` — channel Realtime ressubscrito a cada troca de view
- **Severidade**: 🔴 crítico
- **Localização**: `src/hooks/useUnreadBadges.ts:117-174`
- **O que é**: O segundo `useEffect` que escuta `direct_messages` tem `view` em deps. O autor tentou contornar com `const viewRef = { current: view }` — mas isso é um **objeto literal recriado a cada execução do effect**, não um ref persistente. O comentário "R7#6: Use ref to avoid stale closure" é falso: o handler captura `viewRef` da clausura corrente, mas como o effect roda novamente quando `view` muda, ele já vai estar correto pela própria re-execução. Pior: a re-execução implica `supabase.removeChannel + supabase.channel(...).subscribe()` toda vez.
- **Por que importa**: cada clique em tab (`dashboard` → `history` → `community` → `vip`) gera um round-trip WS Supabase. Usuários ativos trocam de view 20-30x por sessão. Multiplica RTT, custo Realtime, e probabilidade de race conditions onde duas instâncias do canal coexistem brevemente.
- **Sugestão de fix**: remover `view` das deps; mover `view` para um `useRef` real (`const viewRef = useRef(view); useEffect(() => { viewRef.current = view }, [view])`) e ler `viewRef.current` no handler. Mesma técnica para `userSettings` e `onInAppNotify`. Manter apenas `[supabase, userId]` nas deps do effect que cria o channel.

### 🔴 4. Context providers sem memo do `value`
- **Severidade**: 🔴 crítico
- **Localizações**:
  - `src/contexts/DialogContext.tsx:112` — `value={{ dialog, confirm, alert, prompt, closeDialog, showLoading }}`
  - `src/contexts/ToastContext.tsx:53` — `value={{ toast }}`
  - `src/contexts/InAppNotificationsContext.tsx:190` — `value={{ notify, clear }}`
- **O que é**: cada Provider passa um objeto literal como `value`. React compara identidade — objeto fresco = sempre diferente = todos os consumers re-renderizam quando o Provider re-renderiza (que acontece a cada setState interno como `setDialog` ou `setToasts`).
- **Por que importa**: `useDialog` é consumido em dezenas de pontos (cada hook que usa `confirm/alert`). Cada nova prompt/toast força re-render global em cascata até atingir os consumers que de fato leem aquele state. `useToast` idem (impacto menor — menos consumers).
- **Sugestão de fix**:
  ```tsx
  const value = useMemo(
    () => ({ dialog, confirm, alert, prompt, closeDialog, showLoading }),
    [dialog, confirm, alert, prompt, closeDialog, showLoading]
  )
  ```
  Como `confirm/alert/prompt/closeDialog/showLoading` já são `useCallback` estáveis, na prática `value` só muda quando `dialog` muda — comportamento correto. Para evitar re-render mesmo em `setDialog`, separar em dois contextos: um para os métodos (estável) e outro para o `dialog` state (volátil). A maioria dos consumers só precisa dos métodos.

### 🔴 5. `useTryToast` viola Rules of Hooks
- **Severidade**: 🔴 crítico (potencial crash)
- **Localização**: `src/components/WatchSyncProvider.tsx:185-194`
- **O que é**:
  ```tsx
  function useTryToast(): ((msg: string, ...) => void) | null {
    try {
      const ctx = useToast()
      return (msg, kind = 'info') => ctx.toast(msg, kind)
    } catch {
      return null
    }
  }
  ```
  React requer que hooks rodem na mesma ordem em todo render. `useToast()` chama `useContext(ToastContext)` internamente, que lança se o provider está ausente. Se entre dois renders o ToastProvider sair da árvore (hot reload, lazy load com erro, ErrorBoundary fallback) o `useToast()` lança, o `try/catch` "absorve" mas o hook count mudou: React entra em estado inconsistente no próximo render.
- **Por que importa**: crash silencioso difícil de reproduzir mas catastrófico quando acontece (substitui app inteiro por error boundary).
- **Sugestão de fix**: usar `useContext(ToastContext)` direto (que retorna `null` se sem provider, ao invés de throw — exige tornar o contexto `null`-safe no `useToast`). Alternativa: nunca usar Context cross-feature aqui; passar `toast` como prop ou via React 19's `use()` pattern com fallback.

### 🔴 6. `useGeoLocation` deixa GPS nativo (Capacitor) ativo no unmount
- **Severidade**: 🔴 crítico (bateria + privacidade)
- **Localização**: `src/hooks/useGeoLocation.ts:445-453`
- **O que é**: o cleanup de unmount só verifica `typeof id === 'number'` (web). Quando o app roda em iOS native, `watchPosition` retorna `string` — o `if` falha e `clearWatch` nunca é chamado. A função `stopWatching` (usada normalmente) trata ambos os casos, mas o cleanup automático no unmount não.
- **Por que importa**: se o usuário fecha a tela de cardio via gesto (back swipe, troca de view) sem disparar `stopWatching`, o GPS continua transmitindo posições para um listener morto até o processo iOS ser killado. Bateria, calor, privacidade.
- **Sugestão de fix**: chamar a função `stopWatching` (já estável) no cleanup, ou inline o tratamento para `string` IDs também: `if (isNativeRef.current) { loadCapacitorGeolocation().then(l => l?.geo.clearWatch({ id: String(id) })) } else { ... }`.

### 🔴 7. `WatchSyncProvider` chama bridge nativo a cada render
- **Severidade**: 🔴 crítico
- **Localização**: `src/components/WatchSyncProvider.tsx:157-176`
- **O que é**: dois `useEffect` com `watch` no array de deps:
  ```tsx
  useEffect(() => {
    if (!watch.isPaired || !dashboard) return
    watch.pushDashboard(dashboard).catch(() => {})
  }, [watch.isPaired, watch.isWatchAppInstalled, dashboard, watch])
  ```
  `useWatchBridge` retorna `return { ...state, pushDashboard, pushWorkout, ... }` — objeto literal não memoizado, novo a cada render (`useWatchBridge.ts:217`). Logo `watch` é sempre uma nova referência → o effect dispara sempre.
- **Por que importa**: cada render do `IronTracksApp` (que tem dezenas de pieces de state mudando) provoca uma chamada `pushDashboard` via WatchConnectivity bridge. Em sessão ativa: ticker de 1s, logs, presence, tudo dispara renders. O bridge JS↔Swift não é gratuito (serializa JSON, atravessa contexto Capacitor, envia frame WC). É plausivel ver 100+ chamadas/min.
- **Sugestão de fix**: remover `watch` das deps (manter apenas `watch.isPaired`, `watch.isWatchAppInstalled`, `dashboard`). Memoizar o retorno de `useWatchBridge` com `useMemo`. O `dashboard` payload em si já vem memoizado de IronTracksAppClientImpl (linha 753).

### 🟡 8. `WorkoutCard` não memoizado — re-render por keystroke no dashboard
- **Severidade**: 🟡 médio
- **Localização**: `src/components/dashboard/WorkoutCard.tsx:47` (`export function WorkoutCard`)
- **O que é**: componente puro recebendo 10+ props (handlers + workout) sem `React.memo`. Pai `StudentDashboard` re-renderiza sempre que qualquer state interno muda (busy flags, modais abertos, periodized state) — todos os ~20 cards re-renderizam.
- **Por que importa**: dashboard com 20+ treinos. Cada toggle de "Arquivados" ou abertura de menu "Ferramentas" → 20 re-renders desnecessários. Cada um faz aritmética em `exercises[]`, formata strings.
- **Sugestão de fix**: `export const WorkoutCard = React.memo(WorkoutCardInner, (a, b) => a.workout.id === b.workout.id && a.idx === b.idx && a.density === b.density && a.isPeriodized === b.isPeriodized)`. Garantir que handlers passados são estáveis (já são em IronTracksAppClientImpl via useWorkoutCrud).

### 🟡 9. `NormalSet` e demais SetRenderers sem memo
- **Severidade**: 🟡 médio
- **Localização**: `src/components/workout/set-renderers/normalSet.tsx:68` e todos os 14 renderers (`clusterSet.tsx`, `restPauseSet.tsx`, etc)
- **O que é**: nenhum dos renderers de set é `React.memo`-ado. Eles consomem `useWorkoutContext()` portanto re-renderizam com o contexto. Se o context value fosse memoizado (ver finding #1), `memo` ajudaria isolando re-renders quando só uma série mudou.
- **Por que importa**: amplifica problema #1. Mesmo se #1 for resolvido, sem `memo` os renderers ainda re-renderizam pelo lado do provider value.
- **Sugestão de fix**: `React.memo` em cada renderer, com comparador simples `(a, b) => a.exIdx === b.exIdx && a.setIdx === b.setIdx && a.ex === b.ex`. Combinado com #1, deve reduzir trabalho por keystroke em ordem de magnitude.

### 🟡 10. `useTeacherStudentSessions` — Realtime sem filtro
- **Severidade**: 🟡 médio
- **Localização**: `src/hooks/useTeacherStudentSessions.ts:62-100`
- **O que é**: `supabase.channel(...).on('postgres_changes', { event: '*', schema: 'public', table: 'active_workout_sessions' }, ...)` — sem filtro `user_id=in.(...)` ou `teacher_id=eq.(...)`. RLS gate no servidor, OK do ponto de vista de segurança, mas o cliente recebe **todos** os eventos que passam pela RLS dele (todos os alunos do teacher).
- **Por que importa**: para um teacher com 50+ alunos ativos simultaneamente (durante horários de pico), o canal recebe spam de UPDATEs (cada keystroke do aluno triplica). CPU + bateria + bandwidth.
- **Sugestão de fix**: filtrar por `user_id=in.(${studentIds.join(',')})` ou criar uma RPC dedicada que retorne só agregados. Ainda mais limpo: usar Postgres LISTEN/NOTIFY com payload reduzido.

### 🟡 11. `useReportData` — derivações volumosas sem `useMemo`
- **Severidade**: 🟡 médio
- **Localização**: `src/hooks/useReportData.ts:250-260, 467-474`
- **O que é**: `effectivePreviousSession` (lines 250-255), `prevSessionLogs` (261), `prevVolume` (263), `volumeDelta` (264), `prevLogsMap` (434-465), `prevBaseMsMap` (467-474) — todos IIFE/expressões executadas a cada render, sem `useMemo`. Algumas envolvem iteração sobre `previousSession.exercises` × `logs.entries()`.
- **Por que importa**: WorkoutReport é mostrado pós-treino, mas durante a visualização o componente re-renderiza (toggle de seções, click em insights AI, troca de aba). Cada um recomputa essas estruturas.
- **Sugestão de fix**: envolver cada uma em `useMemo` com deps explícitas.

### 🟡 12. `useState` lazy init faltando — alocação por render
- **Severidade**: 🟡 médio
- **Localizações**:
  - `src/contexts/ToastContext.tsx:24` — `useRef(new Map<string, ...>())`
  - `src/contexts/team/useTeamSession.ts:16` — `useRef(new Set())`
  - `src/contexts/team/useTeamInvites.ts:41` — `useRef(new Set())`
- **O que é**: `useRef(new X())` aloca `new X()` a cada render mesmo que só o primeiro seja preservado. JavaScript não dá pra evitar a alocação, só o uso.
- **Por que importa**: alocação pura — em providers que re-renderizam dezenas/centenas de vezes, geram pressure no GC. Não é crítico mas é cosmético.
- **Sugestão de fix**: usar `useState(() => new Map())[0]` (lazy init de useState retorna função, então não aloca) ou `const ref = useRef<Map<...> | null>(null); if (!ref.current) ref.current = new Map()`.

### 🟡 13. Index como key em editors mutáveis
- **Severidade**: 🟡 médio
- **Localizações**:
  - `src/components/ExerciseEditor.tsx:236` — `<React.Fragment key={index}>` em lista de exercícios
  - `src/components/HistoryListEditModal.tsx:128` — `key={idx}` em itens histórico
  - `src/components/AdminWorkoutEditor.tsx:116` — `key={idx}` em exercícios
- **O que é**: usar `index` como `key` em listas onde o usuário pode reordenar/inserir/deletar quebra a identidade do React. State local (focus, input value não-controlado, animações) é preservado no índice errado.
- **Por que importa**: bugs sutis ao reordenar exercícios no editor. Usuário focado no input "peso" do exercício 3, arrasta exercício 1 para baixo, foco "pula" para exercício 2 porque o index 3 agora aponta para item diferente. Em produção isso já foi visto em vários frameworks.
- **Sugestão de fix**: `key={exercise.id ?? exercise._itx_exKey ?? \`fallback-${exercise.name}-${exercise.created_at}\`}`. Garantir que toda exercise tem ID estável ao criar.

### 🟡 14. `useRef(createClient()).current` desperdiça alocações
- **Severidade**: 🟡 médio
- **Localizações**:
  - `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx:308`
  - `src/components/ExecutionVideoCapture.tsx:34`
  - `src/components/admin-panel/AdminNotificationBell.tsx:70`
- **O que é**: `useRef(createClient()).current` — `createClient()` é chamado a cada render, mas só o valor do primeiro é mantido. Cada render aloca uma instância completa de Supabase client (com auth listener + storage listener) que é descartada.
- **Por que importa**: as instâncias órfãs registram listeners no `window` antes de virarem garbage. Cumulativo durante a vida do app.
- **Sugestão de fix**: `const [supabase] = useState(() => createClient())` ou usar `useStableSupabaseClient`.

### 🟢 15. `useLocalPersistence` deixa setTimeout de IDB pendente no unmount
- **Severidade**: 🟢 baixo
- **Localização**: `src/hooks/useLocalPersistence.ts:113-121`
- **O que é**: o cleanup do effect só limpa o timer de 250ms do localStorage; o timer de 2s do IDB persiste deliberadamente (comentário diz "Don't clear idbTimer on cleanup — let it complete"). Se o componente unmonta e `userId` ainda está no escopo, `persistActiveSession` será chamado após o unmount.
- **Por que importa**: benigno em produção (persiste mesmo após o usuário sair). Mas é um leak controlado, e se o usuário trocar de conta antes do timer disparar, dados de A podem ser persistidos como se fossem de B (improvável, mas possível).
- **Sugestão de fix**: capturar `userId` em closure local e checar em refresh time, ou simplesmente fazer cleanup; persistência crítica deve ser síncrona ou via Service Worker.

### 🟢 16. `usePushNotifications` pode adicionar listeners após unmount
- **Severidade**: 🟢 baixo
- **Localização**: `src/hooks/usePushNotifications.ts:13-119`
- **O que é**: a função `run()` é async e leva tempo para concluir (imports dinâmicos + permissions check + addListener). Se o cleanup roda antes de `run()` chegar em `handles.push(regHandle)`, esses listeners ficam órfãos. O guard `if (!alive) return` está espalhado, mas há janelas entre o `await` e o `handles.push`.
- **Por que importa**: típico race entre unmount rápido (ex: SIGNED_OUT) e setup do push. Listeners órfãos disparam callbacks em estado descartado, podendo causar warning ou setState após unmount.
- **Sugestão de fix**: registrar os handles dentro do try imediatamente após cada `await PushNotifications.addListener(...)` e ainda assim chamar `handle.remove()` no `if (!alive)` antes de retornar.

### 🟢 17. `useTryToast` parte 2 — `try/catch` em volta de hook
- **Severidade**: 🟢 baixo
- **Localização**: ver finding #5 — mesmo bug.

### 🟢 18. `ActiveWorkoutContext` é dead code mas confunde
- **Severidade**: 🟢 baixo
- **Localização**: `src/components/workout/ActiveWorkoutContext.tsx` — existe mas `ActiveWorkoutProvider` nunca é montado. `useActiveWorkout` é importado por `SetInputRow` e `ExerciseSet` (que também é dead code — não tem consumers).
- **Por que importa**: confunde quem vai mexer no fluxo de treino. Risco de alguém editar o caminho errado.
- **Sugestão de fix**: deletar `ActiveWorkoutContext.tsx`, `SetInputRow.tsx`, `ExerciseSet.tsx`. Validar com `npm run build`.

### 🟢 19. `useAuthInit` dead code
- **Severidade**: 🟢 baixo
- **Localização**: `src/hooks/useAuthInit.ts`
- **O que é**: hook completo, exportado, mas sem nenhum import. A lógica real está duplicada em `useAppEffects.ts:153-183` (que é o que IronTracksAppClientImpl usa).
- **Sugestão de fix**: deletar.

### 🟢 20. `IronTracksAppClientImpl` — god component (>1200 linhas)
- **Severidade**: 🟢 baixo (arquitetura)
- **Localização**: `src/app/(app)/dashboard/IronTracksAppClientImpl.tsx:1-1285`
- **O que é**: o componente carrega ~30 hooks customizados, define ~10 useState locais para sub-views (createWizardOpen, expressWorkoutOpen, standaloneCardioOpen, nutritionOpen, settingsOpen, offlineSyncOpen, showProgressPhotos, showNotifCenter, ...), renderiza condicionalmente baseado em `view` string. Mistura responsabilidades: gestão de view router-like, modais, contexts, lazy loads.
- **Por que importa**: qualquer mudança implica re-render do componente inteiro. Embora os sub-children sejam lazy/memoizados, o cálculo de quais renderizar passa pelo IronTracksApp. Difícil de testar isoladamente.
- **Sugestão de fix**: refatorar gradualmente movendo cada "view branch" para um sub-componente cliente próprio (`<DashboardView />`, `<ActiveWorkoutView />`, etc) e migrar os useStates de modal para Zustand ou contexts dedicados. Trocar string `view` por roteamento real (Next.js parallel routes / intercepted routes funcionam aqui).

### 🟢 21. `useCardioTracking` — setMetrics dentro de setTrackPoints updater
- **Severidade**: 🟢 baixo
- **Localização**: `src/hooks/useCardioTracking.ts:171-214`
- **O que é**: dentro do callback de `setTrackPoints((prev) => { ...; setMetrics({...}); return updated; })`. React permite mas é considerado anti-pattern: o updater deveria ser puro. Funciona porque os dois estados são independentes, mas se React detectar via StrictMode dupla-execução, `setMetrics` será chamada duas vezes.
- **Sugestão de fix**: calcular `updated` puro no updater, mover `setMetrics` para um `useEffect` que reaja a `trackPoints`.

### 🟢 22. `useSessionSync.ts:496` — ESLint disable com truthy boolean
- **Severidade**: 🟢 baixo
- **Localização**: `src/hooks/useSessionSync.ts:496`
- **O que é**: `}, [!!activeSession, supabase, userId, isMissingTable, notifyMigrationWarning])` — `!!activeSession` é o dep para evitar re-firing quando logs internos mudam, só quando "existe ou não" muda. Funciona, mas o eslint disable acima disfarça a intenção.
- **Sugestão de fix**: extrair `const hasActiveSession = !!activeSession` em uma variável nomeada com comentário, manter eslint enabled. Ou usar `useRef + useEffect` para reagir só ao toggle.

## Oportunidades de modernização (React 19)

- **`use(promise)`** para data fetching: `useReportData`, `useUserSettings`, `useBootstrap`, `useWorkoutFetch` poderiam expor Promises consumidas via `use()` dentro de `<Suspense>` boundaries por seção. Hoje cada hook tem seu próprio `loading` state, gerando UI flicker.
- **`useOptimistic`**: `useOptimisticAction` é uma reimplementação manual. Trocar para o hook nativo do React 19 e enxugar a API. Casos quentes: like de post na comunidade, accept invite, mark notification as read.
- **`useFormStatus`**: formulários de login/register/checkin (`useLoginScreen`, `useProfileSave`, `ProfilePage`, `SettingsModal`) hoje gerenciam `saving` state manualmente. Migrar para Server Actions + `useFormStatus` torna o estado pending automático.
- **`useActionState`**: pareado com Server Actions (que IronTracks já usa via `src/actions/`), substitui o boilerplate "useState + try/finally + setSaving" em todos os modais.
- **`useTransition`**: já adotado em `useViewNavigation` e `NutritionMixer`. Bons candidatos adicionais: filtros pesados em StudentsTab, busca de exercise no editor, mudança de range no HistoryList.
- **TanStack Query**: zero adoção. Server state vive em useState + useEffect espalhado por dezenas de hooks. Cada um inventou seu próprio dedupe/cache/revalidate (ex: `isFetching` ref em `useWorkoutFetch`, `cardioWorkoutIdRef` em `useReportData`, `kcalApiCalledRef` no mesmo arquivo). Migrar para `useQuery`/`useMutation` resolveria offline-first, optimistic updates, e elimina centenas de linhas de bookkeeping.
- **Zustand** (ou Jotai): para o estado global da `view` + modais abertos do IronTracksAppClient, em vez de 10 useState no god component. Permite que sub-views toggle modais sem precisar passar props através da árvore.
- **Compound components**: o `ExerciseEditor` e `WorkoutReport` exporiam APIs muito mais limpas como compound components em vez de aceitar props mega-objetos. Hoje cada um tem 15+ props.
- **Ref como prop (React 19)**: já é possível remover `forwardRef` em vários lugares. Não é crítico mas reduz boilerplate.
- **`useDeferredValue`**: para inputs com busca incremental (search em StudentsTab, AIExerciseSwap, etc) em vez de debounce manual.

## O que verifiquei e está OK

- **`useFocusTrap`** (`src/hooks/useFocusTrap.ts`) — cleanup correto, sem leaks.
- **`HistoryList`** (`src/components/HistoryList.tsx`) — usa `@tanstack/react-virtual` (window virtualizer), keys estáveis pelo `session.id`.
- **`WorkoutTimerContext`** (`src/components/workout/WorkoutTimerContext.tsx`) — split correto do ticker em provider próprio, `value` memoizado, evita re-renderizar o WorkoutContext inteiro a cada segundo. Bom exemplo de como o WorkoutContext principal deveria ser feito.
- **`useSessionSync`** (`src/hooks/useSessionSync.ts`) — cleanup completo de channels Realtime, dedup com `_deviceId`, sanitização de timer stale; lógica de echo guard sólida.
- **`useGuidedTour`** e **`useSeasonalCampaign`** — não vi leaks. Standard local-storage gating.
- **`useNativeTimerActions`** — listeners removidos no cleanup, refs corretos.
- **`ErrorReporterProvider`** — cleanup completo dos window listeners, throttle por signature, inFlightRef previne re-entry.
- **`NotificationCenter`** — channel cleanup correto, mark-read debounced com cancellation flag.
- **`useWorkoutStreak`** — cleanup correto com cancelled flag, sem leaks.
- **`useStudentControlNotice`** — channel cleanup correto, dois effects (load + subscribe) separados corretamente.
- **`useBackgroundRefresh`** e **`useLiveActivityPushSync`** — não inspecionados em detalhe mas patterns vistos em arquivos similares parecem consistentes.
- **`page.tsx`** do dashboard — Server Component fazendo o hydrate inicial. Adoção correta do App Router.

## Áreas grandes não cobertas em detalhe

- `MuscleMapCard.tsx` (791 linhas) e `IronRankCard.tsx` (582 linhas) — provavelmente têm cálculos pesados que deveriam ser memoizados; não inspecionei.
- `Modals.tsx` no workout (948 linhas) — concentra todos os modais de método; cada um pode ter problemas próprios.
- `CommunityClient.tsx` (671 linhas) — feed sem virtualização confirmada; se feed cresce, precisa de pagination + virtualization.
- Toda pasta `src/components/admin-panel/` (8 tabs grandes) — auditoria seria longa; provavelmente o `StudentsTab` se beneficia de virtualização quando lista de alunos passar de algumas centenas.
- `useWorkoutFinish`, `useWorkoutDeload`, `useWorkoutMethodSavers` — sub-hooks do controller; vale revisar memoization dos retornos para garantir que não invalidam o controller a cada render.

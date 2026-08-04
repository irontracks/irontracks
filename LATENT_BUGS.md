# IronTracks — Bugs Latentes (sweep proativo)

Data: 2026-05-14

## Resumo executivo

Sweep de hooks/components/contexts em busca de padrões similares aos 2 bugs corrigidos hoje (avatar dropdown clippado + sessão de treino perdida no background). **16 findings** identificados, focados em persistência mobile, timers em background, e overflow-x-hidden hospedando children absolute.

- 🔴 **5 críticos** — perda de dados real em mobile (cardio sem checkpoint, teacher control perde edição final, server upsert cancelado no background) + dropdown clippado dentro do StudentDashboard
- 🟡 **7 médios** — drenam bateria em background, listener leaks específicos, escapes de overflow sob telas estreitas
- 🟢 **4 baixos** — code smell, edge cases raros

Os 3 fixes mais impactantes (B-001 cardio sem checkpoint, B-002 teacher save perdido, B-007 require() em ESM) cobrem todos os domínios de bug do dia.

---

## Findings

### 🔴 B-001: Cardio GPS perde dados todos se app crashar mid-run — ZERO checkpoint

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useCardioTracking.ts:126-306` + `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/components/workout/CardioGPSPanel.tsx:314-360`
- **O que é**: Cardio tracking acumula `trackPoints` e `metrics` apenas em `useState` in-memory. Save no servidor (`/api/gps/cardio/save`) só dispara em `handleStop()`. Não há `localStorage`/IDB checkpoint a cada N pontos nem em `visibilitychange`/`pagehide`/`appStateChange`. Em corrida de 1h+ trilha, se app for killed pelo iOS por baixa memória (cardio + Live Activity + GPS contínuo + HR é caro), perde 100% dos dados.
- **Reprodução**: Iniciar corrida → rodar 30min → forçar app close (swipe-up) → reabrir → todos os GPS points/distance/pace evaporaram.
- **Fix**: Adicionar checkpoint async a cada N (~30) trackPoints novos OR a cada 60s, salvando `cardio:active:<userId>` em IDB. Listener `visibilitychange`/`pagehide` + Capacitor `appStateChange` flush síncrono dos `trackPoints` + `metrics` + `startTimeRef.current`. Em mount do `useCardioTracking`, recuperar e perguntar "Retomar corrida em andamento?". Espelha o pattern do PR #104 mas pra cardio.
- **Esforço**: **1d** (2h hook, 2h panel UI de recovery, 4h testes em device).

### 🔴 B-002: useTeacherControl cancela debounce no unmount — última edição do prof é perdida no background

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useTeacherControl.ts:178-191`
- **O que é**: Mesmo bug do PR #99/104 mas no lado do professor. `patchState` agenda `setTimeout(flushSave, 800)`. O cleanup do useEffect na linha 189 chama `clearTimeout(saveTimerRef.current)` no unmount. Quando professor está acompanhando aluno e backgrounda o app dentro de 800ms da última edição (ajustando carga/reps em set), o save NUNCA dispara — aluno nunca recebe a correção.
- **Reprodução**: Professor edita carga de uma série pelo modal de controle → fecha app (home button) ANTES de 800ms passar → reabrir → server não recebeu o patch → aluno continua com valor velho.
- **Fix**: Mesma estratégia do `useLocalPersistence`: listener `visibilitychange`/`pagehide`/Capacitor `appStateChange` que faz `flushSave(sessionRef.current)` síncrono. Como envolve `fetch`, usar `navigator.sendBeacon` quando disponível ou prep do payload pra fire-and-forget.
- **Esforço**: **2h**.

### 🔴 B-003: useSessionSync upsert debounced cancelado no cleanup — server pode perder última série em mobile

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useSessionSync.ts:420-426`
- **O que é**: O debounced upsert pro servidor (900ms) tem `clearTimeout` no cleanup. Em mobile, o `useLocalPersistence` (PR #104) já cobre o caso de localStorage/IDB locais, MAS o servidor `active_workout_sessions` pode perder a última atualização quando user backgrounda o app dentro de 900ms da última série completada. O heartbeat de 30s eventualmente recupera, mas se app fica fechado por dias e abre em OUTRO device, o outro device pega o estado velho.
- **Reprodução**: Completar série final do treino → backgroundar app dentro de 900ms → fazer login em outro device antes do app voltar → última série não aparece.
- **Fix**: Mesmo padrão. No `useLocalPersistence` já tem o flush listener — duplicar a estratégia aqui pra disparar `run()` síncrono via `navigator.sendBeacon` ou `fetch({ keepalive: true })` com o último payload.
- **Esforço**: **2h**.

### 🔴 B-004: WorkoutToolsPanel dropdown pode ser clippado dentro do StudentDashboard overflow-x-hidden

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/components/dashboard/WorkoutToolsPanel.tsx:54` (`absolute right-0 mt-2 w-72`) hospedado em `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/components/dashboard/StudentDashboard.tsx:268` (`overflow-x-hidden`).
- **O que é**: Mesmo padrão exato do bug do avatar dropdown (PR #103). O `StudentDashboard` raiz tem `p-4 space-y-3 pb-24 overflow-x-hidden`. Por CSS spec, `overflow-x: hidden` força `overflow-y: auto` (não-`visible`). O painel de ferramentas (288px, absolute) hospedado em sub-container `flex-1` pode ser clippado em iPhone SE/iPad split.
- **Reprodução**: iPhone SE (375px) → tab Dashboard → clicar em "Ferramentas" botão de fluxo de treino → o painel dropdown pode ter borda inferior cortada / ser clippado horizontalmente.
- **Fix**: Trocar `overflow-x-hidden` por `overflow-x-clip` no StudentDashboard linha 268. `overflow-x-clip` NÃO obriga `overflow-y` a virar não-visible.
- **Esforço**: **5min** (mesmo fix do avatar).

### 🔴 B-005: ActiveWorkout container `overflow-x-hidden` + RestTimerOverlay com `fixed inset-0` aninhado — não é problema mas duplica RestTimer poderia ser

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/components/ActiveWorkout.tsx:192` (`fixed inset-0 z-[50] flex flex-col bg-neutral-950 text-white overflow-x-hidden`)
- **O que é**: O modal `fixed inset-0` raiz tem `overflow-x-hidden`. RestTimerOverlay (linha 519) sobe `fixed inset-0 z-[2000]` — z-index sobre o `z-[50]` do parent, então renderiza por cima e escapa OK. PORÉM tooltips/popovers/menus internos do exercise execution panel que estejam DENTRO do scroll children (linha 200, `overflow-y-auto overflow-x-hidden`) PODEM ser clippados verticalmente porque overflow-x-hidden força overflow-y a virar `auto`. Hoje os children (ExerciseList, CardioGPSPanel) não usam absolute escapando, mas é um landmine pro futuro.
- **Reprodução**: Hipotética hoje. Real se algum dev adicionar tooltip absolute "?" em qualquer exercise card.
- **Fix**: Defensivo. Trocar `overflow-x-hidden` por `overflow-x-clip` em ambas as linhas 192 e 200.
- **Esforço**: **5min**.

### 🟡 B-006: usePushNotifications sem dedupe — duplicação de navigation events em hot reload / re-mount

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/usePushNotifications.ts:102-120`
- **O que é**: `pushNotificationActionPerformed` listener dispara `window.dispatchEvent('irontracks:push:navigate')`. Sem `lastActionId` ref check. Em iOS, quando user toca em push enquanto app está em background, o WKWebView pode re-deliver o action durante o cold-launch + warm-launch (raro mas possível). Resultado: navegação duplicada (push abre tela duas vezes, scroll posicionado errado).
- **Reprodução**: Receber push → tap em push enquanto app está hibernado → ver navigation event disparar 2x se WKWebView fizer warm-launch.
- **Fix**: Adicionar `lastActionIdRef` que armazena `action.notification.id`. Se igual ao último, skip dispatch. TTL de 5s no ref.
- **Esforço**: **30min**.

### 🟡 B-007: `require('@capacitor/app')` síncrono em arquivos ESM/client — quebrado no Next.js 16 Turbopack

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/components/workout/RestTimerOverlay.tsx:205` + `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/components/SettingsModal.tsx:125-128`
- **O que é**: Ambos arquivos têm `"use client"` (ESM modules) mas usam `require('@capacitor/app')`, `require('@capacitor/core')`, `require('@capacitor/push-notifications')`, `require('@capacitor/device')` síncronos. Next.js 16 + Turbopack bundleia ESM nativamente — `require` em client component pode falhar com `ReferenceError: require is not defined` em dev mode ou em build de produção via Vercel. No best case são embrulhados em try/catch que **engole o erro** — features ficam mortas sem aviso.
  - Em `RestTimerOverlay`: o appStateChange listener pra parar alarm quando app volta do background **nunca registra** → alarm continua tocando quando user volta pro app.
  - Em `SettingsModal.loadIosDiag`: o tela de diagnóstico iOS no settings **sempre falha silenciosamente** — só aparece "iosDiag: null", parece "feature não funciona em iOS" mas é o `require()` quebrando.
- **Reprodução**: No iOS, abrir Settings → seção "Diagnóstico iOS" → tudo aparece em branco/erro genérico. Ou: durante rest timer alarm, backgroundar app, voltar — alarm continua tocando indevidamente.
- **Fix**: Trocar `require(...)` por `await import(...)` dinâmico (já é o pattern do resto do codebase — ver `useLocalPersistence.ts:201`). Ou converter pra `import` estático no topo.
- **Esforço**: **1h** (testar em iOS device real após cap:sync).

### 🟡 B-008: useOfflineSync interval de 15s não pausa em background — bateria + dados móveis

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useOfflineSync.ts:119-125`
- **O que é**: `setInterval(runFlushQueue, 15_000)` dispara enquanto houver `syncState.pending > 0`. Não pausa em `visibilitychange hidden` nem `appStateChange isActive=false`. Em iOS, WKWebView muitas vezes mantém JS rodando por minutos após background — flush continua tentando, queima rede móvel e bateria. Em conexão ruim, repetidos timeouts esgotam bateria.
- **Reprodução**: Treinar offline → backgroundar app → assistir uso de bateria em Settings → IronTracks usa % significativo em background.
- **Fix**: Listener `visibilitychange` pausando o interval em hidden, retomando em visible. Mesma estratégia já feita no Watch app (F-025 no MOBILE_AUDIT.md).
- **Esforço**: **30min**.

### 🟡 B-009: useTeamPresence heartbeat de 15s não pausa em background

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/contexts/team/useTeamPresence.ts:107-115`
- **O que é**: `setInterval(upsert, 15000)` faz upsert constante na `team_session_presence` table. Em sessão de treino em dupla, o app fica horas com isso rodando. Em background, continua disparando — desperdiça quota Supabase, drena bateria, congestiona Realtime channel.
- **Reprodução**: Treino em dupla → backgroundar app → 15s depois, query no Supabase mostra UPSERT chegando da sessão hibernada.
- **Fix**: Mesma estratégia do B-008. Pausar interval em `document.hidden`. Bonus: ao retomar, fazer 1 upsert imediato pra refresh status.
- **Esforço**: **30min**.

### 🟡 B-010: useTeamBroadcast poll de 15s + useTeamInvites poll de 20s em background

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/contexts/team/useTeamBroadcast.ts:413` + `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/contexts/team/useTeamInvites.ts:262, 409`
- **O que é**: Polling pra mensagens de chat (15s) e convites (20s, 2 lugares). Não pausa em background. **MAS** o useTeamInvites JÁ tem `visibilitychange` handler que dispara refetch ao voltar — só não pausa o poll quando some. Pode-se decidir manter o poll vivo "pra notificar via background" mas isso é o que push notif existe pra fazer.
- **Reprodução**: Mesmo do B-009.
- **Fix**: Pausar setInterval em `document.hidden`. Listeners visibility já existem; só falta o pause/resume.
- **Esforço**: **30min**.

### 🟡 B-011: useEffect "Audit panel restore" listener nunca removido (não bug crítico mas suspeito)

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useAppEffects.ts:215-233`
- **O que é**: useEffect com `restoreAdminPanelIfNeeded` registra `visibilitychange` e `pageshow`, cleanup remove ambos. Tudo OK aqui — colocado pra verificação. Mas notei que **alguns** outros visibility listeners (RestTimerOverlay linha 197-220) usam `require` síncrono — então o cleanup pode falhar silenciosamente em browser/Turbopack, deixando listener órfão. Ver B-007.
- **Reprodução**: Hot reload em dev. Listener `appStateChange` do `require('@capacitor/app')` em RestTimerOverlay nunca registra com sucesso → cleanup não remove nada → quando o `App.addListener` PROMISSE eventually resolve no warm-launch, fica órfão.
- **Fix**: Resolver B-007 elimina este como side effect.
- **Esforço**: incluído no B-007.

### 🟡 B-012: useLocalPersistence restore só dispara em `/dashboard` exato — sub-rotas perdem recovery

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useLocalPersistence.ts:52-74`
- **O que é**: O comentário (PR#4a) explica que restore só atua em `window.location.pathname === '/dashboard'` pra evitar loop. Mas user pode crashar enquanto está em `/dashboard/active/[sessionId]` (treino ativo URL real). Ao reabrir, vai direto pra `/dashboard/active/[sessionId]` (Capacitor preserva URL) → useLocalPersistence NÃO restora a sessão porque path não é `/dashboard` → mas a sub-rota tenta hidratar via URL params e não acha (sessionId aleatório do dia anterior). User vê "Treino não encontrado" e o estado do localStorage está intacto mas órfão.
- **Reprodução**: Iniciar treino → ir pra `/dashboard/active/abc-123` → matar app → reabrir → URL preservada → tela de erro "treino inexistente" embora localStorage tenha o snapshot.
- **Fix**: Restore deve atuar em ambos `/dashboard` E `/dashboard/active/*`. Ou melhor: hidratar via URL session ID, mas fallback pro localStorage quando sessionId não bate.
- **Esforço**: **2h** (precisa coordenar com sub-routing do PR#4a).

### 🟢 B-013: RealtimeNotificationBridge silent fail no createClient — usuário não recebe nada e não sabe

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/components/RealtimeNotificationBridge.ts:23-27, 85-92`
- **O que é**: try/catch genérico no `createClient()` retorna `return` (line 26) sem logger. Se Supabase URL estiver com cert expirado ou env var quebrada em dev, hook vira no-op silencioso. Mais 3 catches vazios na linha 85, 90, 99 — todos sem `logWarn`/`logError`. Quando algo falha realmente, ninguém sabe.
- **Reprodução**: Quebrar `NEXT_PUBLIC_SUPABASE_URL` em dev → o bridge falha silenciosamente. Nenhum console warning.
- **Fix**: Substituir `catch { return }` por `catch (e) { logWarn('RealtimeNotificationBridge', '...', e); return }`. Consistente com o pattern usado em `usePushNotifications.ts`.
- **Esforço**: **15min**.

### 🟢 B-014: useGymCheckin localStorage catch silenciado

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useGymCheckin.ts:73`
- **O que é**: `try { window.localStorage.setItem(buildCheckinKey(gymId), '1') } catch {}` — sem log. Se localStorage estiver cheio (quota exceeded) ou bloqueado por Safari private mode, falha silenciosamente. Usuário pode revisitar a mesma academia e fazer check-in 2x sem perceber.
- **Reprodução**: Modo Safari private + Storage cheio → check-in feito mas key não escreve → próximo check-in da mesma academia também passa.
- **Fix**: Logar com `logWarn`.
- **Esforço**: **5min**.

### 🟢 B-015: useAssessmentHistoryData tem 7 catches vazios em sequência (lines 162-428)

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useAssessmentHistoryData.ts:162, 193, 364, 376, 389, 401, 428`
- **O que é**: 7 `catch {}` vazios em um único arquivo. Aval/upload/photo fail paths totalmente engolidos. Se Supabase tabela `assessments` der erro 500, user vê empty state em vez de erro acionável.
- **Reprodução**: Quebrar policy RLS em `assessments` → user sente tela em branco.
- **Fix**: Cada catch vira `catch (e) { logWarn('useAssessmentHistoryData', 'specific context', e) }`.
- **Esforço**: **30min**.

### 🟢 B-016: useCheckins setTimeout 0 quando workoutId vazio (line 59) — anti-pattern desnecessário

- **Localização**: `/Volumes/SSD NVME 2TB/Projetos Antigravity/App IronTracks/src/hooks/useCheckins.ts:59`
- **O que é**: `const timer = setTimeout(() => { setCheckinsByKind({ pre: null, post: null }) }, 0)` — usa setTimeout(0) pra resetar state. Provavelmente foi colocado pra evitar warning de "setState during render" mas pode ser substituído por reset síncrono no caminho normal. Se o componente unmounta antes do tick, o `clearTimeout` no cleanup cobre — então não é leak.
- **Reprodução**: Code smell, sem impacto user.
- **Fix**: Remover setTimeout, setState direto, OU usar `useLayoutEffect` se precisar batched.
- **Esforço**: **10min**.

---

## Notas de escopo

- **Não rodei**: build, typecheck, ESLint, testes. Análise 100% estática.
- **Não verifiquei devices reais**: todas reproduções listadas são deduzidas do código + spec dos APIs, não testadas em hardware.
- **Padrões NÃO investigados em profundidade** (próximo audit):
  - `useGuidedTour` (326 linhas, vários localStorage paths)
  - `useStudentSubscription`/`useTeacherStudentSessions`/`useUtmAcquisition` (não auditados)
  - `useReportData`/`useWorkoutFetch` (TanStack Query — coverage de cache stale em background)
  - Components `ChatDirectScreen` setInterval 60s (line 118) — não pausa em background
  - Stories: `StoryViewer` interaction timers (não auditados)
- **Coisas já cobertas pelo MOBILE_AUDIT.md** (não duplicar): F-001..F-025 (Android FCM, Watch app, Sentry nativo, etc).

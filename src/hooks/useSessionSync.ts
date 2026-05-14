/**
 * @module useSessionSync
 *
 * Real-time workout session sync via Supabase Realtime channels.
 * Subscribes to a per-workout broadcast channel so multiple devices
 * (or coach + athlete) can see live set updates simultaneously.
 *
 * Handles channel lifecycle, reconnections, and conflict resolution
 * when two devices edit the same set concurrently.
 *
 * @param workoutId - Workout ID to subscribe to
 * @param userId    - Current user ID
 * @returns `{ isConnected, broadcastUpdate }`
 */
'use client'

import { useEffect, useRef, useCallback } from 'react'

import { z } from 'zod'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import type { ActiveWorkoutSession } from '@/types/app'
import { logError, logWarn } from '@/lib/logger'
import { recoverActiveSession } from '@/lib/offline/activeSessionPersistence'
import { isIosNative, isAndroidNative } from '@/utils/platform'

const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

function parseJsonWithSchema<T>(raw: string, schema: z.ZodType<T>): T | null {
    try {
        const parsed = JSON.parse(raw)
        return schema.parse(parsed)
    } catch {
        return null
    }
}

/**
 * Strip a stale rest-timer target from a hydrated session.
 *
 * `timerTargetTime` is an absolute timestamp (ms since epoch). When the app is
 * killed / backgrounded / restored a non-trivial amount of time later, the
 * persisted timestamp ends up in the PAST — which the RestTimerOverlay reads
 * on its first tick as `remaining = targetTime - now < 0`, setting
 * `isFinished = true` immediately and dumping the user on the green "BORA!"
 * screen with a growing overtime counter BEFORE they've even interacted with
 * the app.
 *
 * Follow-up clicks on OK in this corrupted state appeared to "not start a
 * timer" because the overlay was still stuck finished from the stale target,
 * or because Realtime echo delivered the expired state back from another
 * device and overwrote the fresh `now + duration` value.
 *
 * Rule: if the persisted `timerTargetTime` is within 5s of now, or in the
 * past, drop it. 5s slack covers legitimate near-live resumes (foregrounding
 * during a rest) while cutting out every stale value.
 */
function sanitizeRestoredSession(session: Record<string, unknown>): Record<string, unknown> {
    const raw = session.timerTargetTime
    const t = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
    if (t > 0 && t <= Date.now() + 5000) {
        return { ...session, timerTargetTime: null, timerContext: null }
    }
    return session
}

// Unique identifier for this browser tab / WKWebView instance. Persisted in
// localStorage so it survives iOS WKWebView context suspensions (the OS can
// kill & recreate the JS context when the app backgrounds). Without persistence,
// a new ID would be generated on resume and old Realtime echoes would no longer
// be recognised as self-echoes, causing state reversion.
const DEVICE_ID: string = (() => {
    const KEY = 'irontracks._deviceId'
    try {
        const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
        if (stored && stored.length > 8) return stored
    } catch { /* ignore */ }
    const id = (() => {
        try {
            if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID()
            }
        } catch { /* fallback */ }
        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    })()
    try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
    return id
})()

interface UseSessionSyncParams {
    userId: string | undefined
    supabase: SupabaseClient
    inAppNotify: (payload: unknown) => void
    setActiveSession: React.Dispatch<React.SetStateAction<ActiveWorkoutSession | null>>
    setView: (v: string | ((prev: string) => string)) => void
    suppressForeignFinishToastUntilRef: React.MutableRefObject<number>
    activeSession: ActiveWorkoutSession | null
    setSessionTicker: (v: number) => void
    view: string
    /**
     * When true, the student is being actively controlled by a teacher.
     * Local writes (debounced upsert + heartbeat) are suppressed so the
     * teacher's edits are not overwritten by the student's stale state.
     * The student still RECEIVES Realtime updates from the teacher.
     */
    suppressLocalWrites?: boolean
}

/**
 * Handles all active-workout-session synchronization:
 * 1. Restore from localStorage on mount
 * 2. Load from server (active_workout_sessions table)
 * 3. Realtime subscription for cross-device sync
 * 4. Debounced upsert to server on every activeSession change
 * 5. Session ticker (1s interval for elapsed time)
 */
export function useSessionSync({
    userId,
    supabase,
    inAppNotify,
    setActiveSession,
    setView,
    suppressForeignFinishToastUntilRef,
    activeSession,
    setSessionTicker,
    suppressLocalWrites = false,
}: UseSessionSyncParams) {
    const serverSessionSyncRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; lastKey: string }>({ timer: null, lastKey: '' })
    const serverSessionSyncWarnedRef = useRef(false)
    // Ref para o `run` atual do effect #3. Permite que o lifecycle listener
    // (visibilitychange / pagehide / Capacitor appStateChange) dispare o
    // upsert pendente IMEDIATAMENTE quando o app entra em background, antes
    // do JS pausar. Sem isso, o debounce de 900ms é cancelado no cleanup e
    // a última atualização do servidor é perdida (multi-device fica stale).
    const pendingServerFlushRef = useRef<(() => Promise<void>) | null>(null)
    // Tracks whether local writes should be suppressed (when teacher is in control).
    // Used as a ref so changing this flag doesn't restart the effects.
    // Atualização do .current dentro de useEffect (não em render) — react-hooks/refs.
    const suppressLocalWritesRef = useRef(suppressLocalWrites)
    useEffect(() => { suppressLocalWritesRef.current = suppressLocalWrites }, [suppressLocalWrites])
    // Tracks the _savedAt timestamp of the last upsert we wrote to the server.
    // Used by the Realtime handler as a secondary guard (primary = DEVICE_ID).
    const lastLocalUpsertAtRef = useRef<number>(0)
    // Prevents effect #1 from re-running the restore logic if deps change
    // while userId stays the same.
    const restoredForUserRef = useRef<string>('')

    const notifyMigrationWarning = useCallback(() => {
        if (serverSessionSyncWarnedRef.current) return
        serverSessionSyncWarnedRef.current = true
        try {
            inAppNotify({
                text: 'Sincronização do treino entre navegadores indisponível (migrations pendentes).',
                senderName: 'Aviso do Sistema',
                displayName: 'Sistema',
                photoURL: null,
            })
        } catch { }
    }, [inAppNotify])

    const isMissingTable = useCallback((error: unknown): boolean => {
        const e = error && typeof error === 'object' ? (error as Record<string, unknown>) : null
        const msg = String(e?.message || '').toLowerCase()
        const code = String(e?.code || '').toLowerCase()
        return code === '42p01' || msg.includes('does not exist') || msg.includes('relation') || msg.includes('schema cache')
    }, [])

    // 1. Restore from localStorage + load from server (runs once per userId)
    useEffect(() => {
        const uid = userId ? String(userId) : ''
        if (!uid) return
        // Guard: only restore once per userId — prevents stale localStorage/server
        // data from overwriting in-flight user changes if deps cause a re-fire.
        if (restoredForUserRef.current === uid) return
        restoredForUserRef.current = uid
        let cancelled = false

        const scopedKey = `irontracks.activeSession.v2.${uid}`
        let localSavedAt = 0

        try {
            const raw = localStorage.getItem(scopedKey) || localStorage.getItem('activeSession')
            if (raw) {
                const parsed: unknown = parseJsonWithSchema(raw, z.record(z.unknown()))
                if (isRecord(parsed) && parsed?.startedAt && parsed?.workout) {
                    localSavedAt = Number(parsed?._savedAt ?? 0) || 0
                    // Seed echo guard from restored state — critical on iOS where
                    // WKWebView may reconnect Realtime after app resume and deliver
                    // stale events that would otherwise pass the guard (ref = 0).
                    lastLocalUpsertAtRef.current = Math.max(lastLocalUpsertAtRef.current, localSavedAt)
                    const clean = sanitizeRestoredSession(parsed as Record<string, unknown>)
                    setActiveSession(clean as unknown as ActiveWorkoutSession)
                    setView('active')

                    if (!localStorage.getItem(scopedKey)) {
                        try {
                            localStorage.setItem(scopedKey, JSON.stringify(clean))
                            localStorage.removeItem('activeSession')
                        } catch (e) { logError('hook:useSessionSync.migrateLocalStorage', e) }
                    }
                }
            }
        } catch (e) {
            logError('hook:useSessionSync.restoreLocalStorage', e)
            try {
                localStorage.removeItem(scopedKey)
                localStorage.removeItem('activeSession')
            } catch { }
        }

        // IDB fallback: if localStorage had nothing, try IDB (survives force-close)
        const tryIdbRecovery = async () => {
            if (cancelled || localSavedAt > 0) return // localStorage already had a session
            try {
                const idbSession = await recoverActiveSession(uid)
                if (cancelled) return
                if (idbSession && isRecord(idbSession) && idbSession.startedAt && idbSession.workout) {
                    const idbSavedAt = Number(idbSession._idbSavedAt || idbSession._savedAt || 0)
                    localSavedAt = idbSavedAt
                    lastLocalUpsertAtRef.current = Math.max(lastLocalUpsertAtRef.current, idbSavedAt)
                    const clean = sanitizeRestoredSession(idbSession as Record<string, unknown>)
                    setActiveSession(clean as unknown as ActiveWorkoutSession)
                    setView('active')
                    // Also re-populate localStorage from IDB
                    try { localStorage.setItem(scopedKey, JSON.stringify(clean)) } catch { }
                    logWarn('useSessionSync', 'Session recovered from IDB (localStorage was empty)')
                }
            } catch (e) { logWarn('useSessionSync', 'IDB recovery failed (non-fatal)', e) }
        }
        tryIdbRecovery()

        const loadServer = async () => {
            try {
                const { data, error } = await supabase
                    .from('active_workout_sessions')
                    .select('state, updated_at')
                    .eq('user_id', uid)
                    .maybeSingle()
                if (cancelled) return
                if (error) {
                    if (isMissingTable(error)) notifyMigrationWarning()
                    return
                }

                const state = data?.state
                if (!state || typeof state !== 'object') return
                if (!state?.startedAt || !state?.workout) return

                const updatedAtMs = (() => {
                    const fromCol = typeof data?.updated_at === 'string' ? Date.parse(data.updated_at) : NaN
                    const fromState = Number(state?._savedAt ?? 0) || 0
                    return Math.max(Number.isFinite(fromCol) ? fromCol : 0, fromState)
                })()

                if (updatedAtMs <= localSavedAt) return

                lastLocalUpsertAtRef.current = Math.max(lastLocalUpsertAtRef.current, updatedAtMs)
                const cleanState = sanitizeRestoredSession(state as Record<string, unknown>)
                setActiveSession(cleanState as ActiveWorkoutSession)
                setView('active')
                try {
                    localStorage.setItem(scopedKey, JSON.stringify(state))
                } catch (e) { logError('hook:useSessionSync.persistServerState', e) }
            } catch (e) { logError('hook:useSessionSync.loadServer', e) }
        }

        loadServer()

        return () => { cancelled = true }
    }, [supabase, userId, inAppNotify, setActiveSession, setView, suppressForeignFinishToastUntilRef, isMissingTable, notifyMigrationWarning])

    // 2. Realtime subscription
    useEffect(() => {
        const uid = userId ? String(userId) : ''
        if (!uid) return

        let mounted = true
        let channel: RealtimeChannel | null = null

        try {
            channel = supabase
                .channel(`active-workout-session:${uid}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'active_workout_sessions',
                        filter: `user_id=eq.${uid}`,
                    },
                    (payload: Record<string, unknown>) => {
                        try {
                            if (!mounted) return
                            const ev = String(payload?.eventType || '').toUpperCase()
                            if (ev === 'DELETE') {
                                if (Date.now() < (suppressForeignFinishToastUntilRef.current || 0)) {
                                    suppressForeignFinishToastUntilRef.current = 0
                                    return
                                }
                                setActiveSession(null)
                                setView((prev: string) => (prev === 'active' ? 'dashboard' : prev))
                                try { localStorage.removeItem(`irontracks.activeSession.v2.${uid}`) } catch { }
                                try {
                                    inAppNotify({
                                        text: 'Treino finalizado em outro dispositivo.',
                                        senderName: 'Aviso do Sistema',
                                        displayName: 'Sistema',
                                        photoURL: null,
                                    })
                                } catch { }
                                return
                            }

                            if (ev === 'UPDATE') {
                                const rowNew = isRecord(payload?.new) ? (payload.new as Record<string, unknown>) : null
                                const stateRaw = rowNew?.state
                                const state = isRecord(stateRaw) ? stateRaw : null
                                if (!state || !state?.startedAt || !state?.workout) {
                                    logWarn('useSessionSync', 'ignoring partial realtime UPDATE — missing startedAt or workout')
                                    return
                                }
                                // ── Self-echo guard (primary: device ID) ─────────────────
                                // Every upsert we make includes our DEVICE_ID. If the
                                // incoming event carries the same ID it is our own echo —
                                // discard it unconditionally. This is timing-independent
                                // and eliminates all race conditions.
                                const incomingDeviceId = String((state as Record<string, unknown>)._deviceId ?? '')
                                if (incomingDeviceId === DEVICE_ID) {
                                    return
                                }
                                // Reject events without _deviceId — these are either legacy
                                // writes from before the fix or stale echoes after iOS
                                // WKWebView context recreation. Too risky to apply.
                                if (!incomingDeviceId) {
                                    return
                                }
                                // ── Secondary guard (_savedAt) ──────────────────────────
                                const incomingSavedAt = Number((state as Record<string, unknown>)._savedAt ?? 0) || 0
                                if (incomingSavedAt > 0 && incomingSavedAt <= lastLocalUpsertAtRef.current) {
                                    return
                                }
                                // Genuinely foreign update from another device — apply it.
                                // Sanitize stale rest-timer targets: a realtime echo from another
                                // device (or from this device before a background/kill cycle) can
                                // arrive with a timerTargetTime that's already in the past, which
                                // makes the overlay dump the user straight on the "BORA!" screen
                                // with an overtime counter the instant they open a workout.
                                const cleanRealtime = sanitizeRestoredSession(state as Record<string, unknown>)
                                setActiveSession(cleanRealtime as unknown as ActiveWorkoutSession)
                                setView('active')
                                try { localStorage.setItem(`irontracks.activeSession.v2.${uid}`, JSON.stringify(cleanRealtime)) } catch { }
                            }
                        } catch (e) { logError('hook:useSessionSync.realtimeHandler', e) }
                    }
                )
                .subscribe()
        } catch (e) { logError('hook:useSessionSync.realtimeSubscribe', e) }

        return () => {
            mounted = false
            try {
                if (channel) supabase.removeChannel(channel)
            } catch (e) { logWarn('useSessionSync', 'channel cleanup failed', { error: String(e) }) }
        }
    }, [supabase, userId, inAppNotify, setActiveSession, setView, suppressForeignFinishToastUntilRef])

    // 3. Debounced upsert to server
    useEffect(() => {
        const uid = userId ? String(userId) : ''
        if (!uid) return

        try {
            if (serverSessionSyncRef.current?.timer) {
                try { clearTimeout(serverSessionSyncRef.current.timer) } catch { }
            }
        } catch { }

        const key = (() => {
            try { return JSON.stringify(activeSession || null) } catch { return '' }
        })()

        serverSessionSyncRef.current.lastKey = key

        const run = async () => {
            try {
                if (serverSessionSyncRef.current.lastKey !== key) return

                if (!activeSession) {
                    // DELETE is allowed even under teacher control — finishing/canceling
                    // the workout naturally ends the control session too.
                    const { error } = await supabase.from('active_workout_sessions').delete().eq('user_id', uid)
                    if (error && isMissingTable(error)) notifyMigrationWarning()
                    return
                }

                // Teacher in control — suppress local writes so the teacher's edits
                // aren't overwritten by stale student state. The student still receives
                // Realtime updates and sees the teacher's changes live.
                if (suppressLocalWritesRef.current) return

                const startedAtRaw = activeSession?.startedAt
                const startedAtMs = typeof startedAtRaw === 'number' ? startedAtRaw : new Date(startedAtRaw || 0).getTime()
                if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return
                if (!activeSession?.workout) return

                const savedAt = Date.now()
                const state = { ...(activeSession || {}), _savedAt: savedAt, _deviceId: DEVICE_ID }

                const { error } = await supabase
                    .from('active_workout_sessions')
                    .upsert(
                        {
                            user_id: uid,
                            started_at: new Date(startedAtMs).toISOString(),
                            state,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: 'user_id' }
                    )
                if (error && isMissingTable(error)) notifyMigrationWarning()
                else if (!error) {
                    lastLocalUpsertAtRef.current = savedAt
                }
            } catch (err) { logWarn('useSessionSync', 'sync upsert failed: ' + String(err)) }
        }

        let timerId: ReturnType<typeof setTimeout> | null = null
        try {
            timerId = setTimeout(() => { try { run() } catch (e) { logError('hook:useSessionSync.debouncedRun', e) } }, 900)
            serverSessionSyncRef.current.timer = timerId
        } catch { }

        // Expõe o `run` atual para o flush lifecycle (effect abaixo). Cada
        // re-run deste effect substitui o callback pelo `run` mais recente,
        // que captura o `activeSession` correto via closure.
        pendingServerFlushRef.current = run

        return () => {
            try { if (timerId) clearTimeout(timerId) } catch { }
            // Não limpamos pendingServerFlushRef aqui — o próximo run do
            // effect sobrescreve, e em unmount real (logout) o hook inteiro
            // some junto.
        }
    }, [activeSession, supabase, userId, inAppNotify, setActiveSession, setView, isMissingTable, notifyMigrationWarning])

    // 4. Session ticker (1s interval)
    useEffect(() => {
        if (!activeSession) return
        const id = setInterval(() => {
            try { if (typeof document !== 'undefined' && document.hidden) return } catch { }
            setSessionTicker(Date.now())
        }, 1000)
        return () => clearInterval(id)
    }, [activeSession, setSessionTicker])

    // 5. Heartbeat auto-save (30s interval)
    // Complements the debounced upsert (#3) by ensuring periodic server-side
    // snapshots even when React state hasn't changed. Uses a ref to avoid
    // restarting the interval on every state change. Atualização do .current
    // dentro de useEffect (não em render) — pattern do React 19 + lint refs.
    const activeSessionRef = useRef(activeSession)
    useEffect(() => { activeSessionRef.current = activeSession }, [activeSession])

    // Dep boolean nomeado: extraído pra deixar a intenção explícita no array de
    // deps abaixo (antes era `!!activeSession` inline + eslint-disable).
    const hasActiveSession = !!activeSession

    useEffect(() => {
        const uid = userId ? String(userId) : ''
        if (!uid) return
        if (!hasActiveSession) return // only run while a session is active

        const HEARTBEAT_MS = 30_000 // 30 seconds
        let lastHash = ''

        const heartbeat = async () => {
            try {
                // Skip heartbeat while teacher is in control (same reason as the debounced save)
                if (suppressLocalWritesRef.current) return
                const session = activeSessionRef.current
                if (!session) return
                if (!session.startedAt || !session.workout) return

                // Only upsert if data changed since last heartbeat
                const hash = (() => { try { return JSON.stringify(session.logs || {}) } catch { return '' } })()
                if (hash === lastHash) return
                lastHash = hash

                const startedAtRaw = session.startedAt
                const startedAtMs = typeof startedAtRaw === 'number' ? startedAtRaw : new Date(startedAtRaw || 0).getTime()
                if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return

                const savedAt = Date.now()
                const state = { ...(session || {}), _savedAt: savedAt, _deviceId: DEVICE_ID }

                const { error } = await supabase
                    .from('active_workout_sessions')
                    .upsert(
                        {
                            user_id: uid,
                            started_at: new Date(startedAtMs).toISOString(),
                            state,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: 'user_id' }
                    )
                if (error && isMissingTable(error)) notifyMigrationWarning()
                else if (!error) {
                    lastLocalUpsertAtRef.current = savedAt
                }
            } catch (e) { logError('hook:useSessionSync.heartbeat', e) }
        }

        const intervalId = setInterval(heartbeat, HEARTBEAT_MS)
        return () => clearInterval(intervalId)
        // Intencionalmente depende SÓ da existência de activeSession (não do
        // conteúdo) pra não reiniciar o interval a cada log change. `activeSession`
        // em si é lido via ref dentro do heartbeat() (ver activeSessionRef acima).
    }, [hasActiveSession, supabase, userId, isMissingTable, notifyMigrationWarning])

    // 6. Prevent accidental tab close during active workout (beforeunload)
    useEffect(() => {
        if (!activeSession) return

        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            // Modern browsers ignore custom messages but still show a confirmation dialog
            e.returnValue = 'Você tem um treino em andamento. Deseja sair?'
            return e.returnValue
        }

        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [activeSession])

    // 7. Force server flush on app pause / tab hidden / page hide
    //
    // O effect #3 já faz upsert debounced (900ms). Quando o usuário backgrounda
    // o app (lock screen, swipe up, troca de app) dentro desses 900ms da
    // última série, o cleanup cancela o timer e o servidor fica com estado
    // velho — outro device do mesmo user puxa stale state.
    //
    // useLocalPersistence (PR #104) já cobre o caminho LOCAL (localStorage +
    // IDB) com listeners equivalentes. Este effect espelha a estratégia pro
    // servidor: dispara o `run()` pendente sincronamente assim que o app sair
    // de foco, garantindo que o último estado chegue no Supabase.
    //
    // Padrões cobertos (mesmos do useLocalPersistence):
    //   • `visibilitychange` (hidden) — iOS/Safari/WKWebView background.
    //   • `pagehide` — fallback web (Chrome desktop, Firefox).
    //   • Capacitor `App.appStateChange` — caminho mais cedo em iOS/Android.
    //
    // O upsert é best-effort: chamamos a função supabase normal (sem keepalive)
    // porque o supabase-js já gerencia auth headers e o JS costuma ter alguns
    // ms antes de pausar de fato. Se o request for cancelado, localStorage/IDB
    // local já cobrem a sessão pra restore no próximo launch.
    //
    // suppressLocalWritesRef: quando true (professor controla aluno) NÃO
    // disparamos flush — o professor é a fonte da verdade.
    useEffect(() => {
        if (typeof window === 'undefined') return

        const flushImmediate = () => {
            // Respeita controle do professor — student não deve sobrescrever
            // edições do teacher mesmo no flush de background.
            if (suppressLocalWritesRef.current) return

            const pending = pendingServerFlushRef.current
            if (!pending) return

            // Cancela o debounce pendente pra evitar double-fire (o run vai
            // ser chamado já-já síncrono mesmo).
            try {
                if (serverSessionSyncRef.current?.timer) {
                    clearTimeout(serverSessionSyncRef.current.timer)
                    serverSessionSyncRef.current.timer = null
                }
            } catch { }

            // Dispara o upsert imediatamente. É async mas não dá pra await —
            // o JS pode pausar a qualquer momento. Best-effort: supabase-js
            // mantém o fetch em flight e o iOS dá ~5s de runtime no background
            // antes do hard suspend, suficiente pro request curto completar
            // na maioria dos casos. Erros vão pro logWarn dentro do próprio
            // run() (catch interno).
            try { void pending() } catch (e) { logError('hook:useSessionSync.flushImmediate', e) }
        }

        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flushImmediate()
        }
        const onPageHide = () => flushImmediate()

        document.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('pagehide', onPageHide)

        // Capacitor App lifecycle — só importa dinâmico em mobile nativo pra
        // não inflar o bundle web. `appStateChange` com isActive=false dispara
        // ANTES do JS ser pausado pelo iOS, então é o caminho mais cedo.
        let capListenerHandle: { remove: () => void } | null = null
        let capListenerCancelled = false
        if (isIosNative() || isAndroidNative()) {
            import('@capacitor/app').then(({ App }) => {
                if (capListenerCancelled) return
                App.addListener('appStateChange', (state: { isActive?: boolean }) => {
                    if (!state?.isActive) flushImmediate()
                })
                    .then((h) => {
                        if (capListenerCancelled) { h.remove(); return }
                        capListenerHandle = h
                    })
                    .catch((e) => logWarn('useSessionSync.flush', 'capacitor listener add failed', e))
            }).catch((e) => logWarn('useSessionSync.flush', 'capacitor import failed', e))
        }

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('pagehide', onPageHide)
            capListenerCancelled = true
            capListenerHandle?.remove()
        }
    }, [])
}

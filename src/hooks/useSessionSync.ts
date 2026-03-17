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
import { logWarn } from '@/lib/logger'

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
    view,
}: UseSessionSyncParams) {
    const serverSessionSyncRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; lastKey: string }>({ timer: null, lastKey: '' })
    const serverSessionSyncWarnedRef = useRef(false)
    // Tracks the _savedAt timestamp of the last upsert we wrote to the server.
    // Used by the Realtime handler to discard echoes of our own writes.
    const lastLocalUpsertAtRef = useRef<number>(0)

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

    // 1. Restore from localStorage + load from server
    useEffect(() => {
        const uid = userId ? String(userId) : ''
        if (!uid) return
        let cancelled = false

        const scopedKey = `irontracks.activeSession.v2.${uid}`
        let localSavedAt = 0

        try {
            const raw = localStorage.getItem(scopedKey) || localStorage.getItem('activeSession')
            if (raw) {
                const parsed: unknown = parseJsonWithSchema(raw, z.record(z.unknown()))
                if (isRecord(parsed) && parsed?.startedAt && parsed?.workout) {
                    localSavedAt = Number(parsed?._savedAt ?? 0) || 0
                    setActiveSession(parsed as unknown as ActiveWorkoutSession)
                    setView('active')

                    if (!localStorage.getItem(scopedKey)) {
                        try {
                            localStorage.setItem(scopedKey, JSON.stringify(parsed))
                            localStorage.removeItem('activeSession')
                        } catch { }
                    }
                }
            }
        } catch {
            try {
                localStorage.removeItem(scopedKey)
                localStorage.removeItem('activeSession')
            } catch { }
        }

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

                setActiveSession(state)
                setView('active')
                try {
                    localStorage.setItem(scopedKey, JSON.stringify(state))
                } catch { }
            } catch { }
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
                                    // Payload may be truncated by Supabase Realtime — ignore partial updates
                                    // instead of zeroing the active session (which would lose workout data)
                                    logWarn('useSessionSync', 'ignoring partial realtime UPDATE — missing startedAt or workout')
                                    return
                                }
                                // ── Self-echo guard ─────────────────────────────────────────
                                // Supabase Realtime echoes every UPDATE back to the device that
                                // triggered it. We track the exact _savedAt we last wrote
                                // (lastLocalUpsertAtRef). If the incoming event's _savedAt is ≤
                                // that value it must be our own echo (or an older write) — discard
                                // it to avoid reverting user actions (e.g. done=true → done=false).
                                const incomingSavedAt = Number((state as Record<string, unknown>)._savedAt ?? 0) || 0
                                if (incomingSavedAt <= lastLocalUpsertAtRef.current) {
                                    return
                                }
                                // R2#8: Apply valid state from a different device (genuinely newer)
                                setActiveSession(state as unknown as ActiveWorkoutSession)
                                setView('active')
                                try { localStorage.setItem(`irontracks.activeSession.v2.${uid}`, JSON.stringify(state)) } catch { }
                            }
                        } catch { }
                    }
                )
                .subscribe()
        } catch { }

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
                    const { error } = await supabase.from('active_workout_sessions').delete().eq('user_id', uid)
                    if (error && isMissingTable(error)) notifyMigrationWarning()
                    return
                }

                const startedAtRaw = activeSession?.startedAt
                const startedAtMs = typeof startedAtRaw === 'number' ? startedAtRaw : new Date(startedAtRaw || 0).getTime()
                if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) return
                if (!activeSession?.workout) return

                const savedAt = Date.now()
                const state = { ...(activeSession || {}), _savedAt: savedAt }

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
                    // Record the exact timestamp we just wrote so the Realtime
                    // handler can identify and discard the echo of this upsert.
                    lastLocalUpsertAtRef.current = savedAt
                }
            } catch (err) { logWarn('useSessionSync', 'sync upsert failed: ' + String(err)) }
        }

        let timerId: ReturnType<typeof setTimeout> | null = null
        try {
            timerId = setTimeout(() => { try { run() } catch { } }, 900)
            serverSessionSyncRef.current.timer = timerId
        } catch { }

        return () => { try { if (timerId) clearTimeout(timerId) } catch { } }
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
    // restarting the interval on every state change.
    const activeSessionRef = useRef(activeSession)
    activeSessionRef.current = activeSession

    useEffect(() => {
        const uid = userId ? String(userId) : ''
        if (!uid) return
        if (!activeSession) return // only run while a session is active

        const HEARTBEAT_MS = 30_000 // 30 seconds
        let lastHash = ''

        const heartbeat = async () => {
            try {
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

                const state = { ...(session || {}), _savedAt: Date.now() }

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
            } catch { /* silent — best effort */ }
        }

        const intervalId = setInterval(heartbeat, HEARTBEAT_MS)
        return () => clearInterval(intervalId)
        // Intentionally only depends on userId + activeSession existence (not content)
        // so the interval is not restarted on every log change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!activeSession, supabase, userId, isMissingTable, notifyMigrationWarning])

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
}

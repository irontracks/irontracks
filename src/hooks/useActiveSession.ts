/**
 * @module useActiveSession
 *
 * Manages the lifecycle of an active workout session — from pre-checkin
 * (energy/soreness) through set logging to session completion.
 *
 * Provides `startSession`, `endSession`, `updateLogs`, and pre-checkin draft
 * state. Persists in-flight data to localStorage so sessions survive page
 * refreshes. Used by the main workout screen and workout controller.
 */
import { logWarn } from '@/lib/logger'
import { useState, useRef, useCallback, useEffect } from 'react'
import { setIdleTimerDisabled } from '@/utils/native/irontracksNative'
import { ActiveSession, ActiveWorkoutSession } from '@/types/app'

export type PreCheckinDraft = {
    energy: string
    soreness: string
    timeMinutes: string
    notes: string
}

export type UseActiveSessionOptions = {
    userId?: string | null
}

export type UseActiveSessionReturn = {
    // Sessão ativa
    activeSession: ActiveWorkoutSession | null
    setActiveSession: React.Dispatch<React.SetStateAction<ActiveWorkoutSession | null>>
    suppressForeignFinishToastUntilRef: React.MutableRefObject<number>
    sessionTicker: number
    setSessionTicker: (v: number) => void

    // Editor de sessão ativa
    editActiveOpen: boolean
    setEditActiveOpen: React.Dispatch<React.SetStateAction<boolean>>
    editActiveDraft: Record<string, unknown> | null
    setEditActiveDraft: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>
    editActiveBaseRef: React.MutableRefObject<Record<string, unknown> | null>
    editActiveAddExerciseRef: React.MutableRefObject<boolean>

    // Pre-checkin
    preCheckinOpen: boolean
    setPreCheckinOpen: React.Dispatch<React.SetStateAction<boolean>>
    preCheckinWorkout: ActiveSession | null
    setPreCheckinWorkout: React.Dispatch<React.SetStateAction<ActiveSession | null>>
    preCheckinDraft: PreCheckinDraft
    setPreCheckinDraft: React.Dispatch<React.SetStateAction<PreCheckinDraft>>
    preCheckinResolveRef: React.MutableRefObject<((value: unknown) => void) | null>
    requestPreWorkoutCheckin: (workout: unknown) => Promise<unknown>

    // Handlers de sessão
    handleUpdateSessionLog: (key: string, data: unknown) => void
    handleStartTimer: (duration: number, context: unknown) => void
    handleCloseTimer: () => void
    handleTimerFinish: (context?: unknown) => void
    handleStartFromRestTimer: (context?: unknown) => void
    handleFinishSession: (
        sessionData: unknown,
        showReport: boolean | undefined,
        setView: (v: string) => void,
        setReportData: (d: unknown) => void,
        setReportBackView: (v: string) => void
    ) => void
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

export function useActiveSession({ userId }: UseActiveSessionOptions): UseActiveSessionReturn {
    const [activeSession, setActiveSession] = useState<ActiveWorkoutSession | null>(null)
    const suppressForeignFinishToastUntilRef = useRef<number>(0)
    // ── sessionTicker removed as STATE to eliminate 1-second re-render cascade.
    // Previously, `useState(0)` + `setSessionTicker(Date.now())` every 1s caused
    // IronTracksAppClientImpl to re-render, cascading to ActiveWorkout →
    // controller → WorkoutProvider → ALL NormalSet components, clobbering input
    // state on iOS WKWebView. DashboardModals (the only consumer) now runs its
    // own local interval. setSessionTicker is kept as a no-op for backward compat.
    const sessionTicker = 0
    const setSessionTicker = useCallback((_v: number) => { /* no-op: ticker moved to DashboardModals */ }, [])
    const [editActiveOpen, setEditActiveOpen] = useState(false)
    const [editActiveDraft, setEditActiveDraft] = useState<Record<string, unknown> | null>(null)
    const editActiveBaseRef = useRef<Record<string, unknown> | null>(null)
    const editActiveAddExerciseRef = useRef(false)

    const [preCheckinOpen, setPreCheckinOpen] = useState(false)
    const [preCheckinWorkout, setPreCheckinWorkout] = useState<ActiveSession | null>(null)
    const [preCheckinDraft, setPreCheckinDraft] = useState<PreCheckinDraft>({
        energy: '',
        soreness: '',
        timeMinutes: '60',
        notes: '',
    })
    const preCheckinResolveRef = useRef<((value: unknown) => void) | null>(null)

    const requestPreWorkoutCheckin = useCallback(
        async (workout: unknown): Promise<unknown> => {
            if (!userId) return null
            if (preCheckinOpen) return null
            return new Promise((resolve) => {
                preCheckinResolveRef.current = (value: unknown) => {
                    resolve(value ?? null)
                }
                setPreCheckinWorkout(isRecord(workout) ? (workout as ActiveSession) : null)
                setPreCheckinDraft({ energy: '', soreness: '', timeMinutes: '60', notes: '' })
                setPreCheckinOpen(true)
            })
        },
        [preCheckinOpen, userId]
    )

    // Keep the screen on while a workout session is active
    const isActive = activeSession !== null
    useEffect(() => {
        if (!isActive) return
        setIdleTimerDisabled(true).catch(() => { /* non-native env */ })
        return () => { setIdleTimerDisabled(false).catch(() => { }) }
    }, [isActive])

    const handleUpdateSessionLog = useCallback((key: string, data: unknown) => {
        setActiveSession((prev) => {
            if (!prev) return prev
            const logs = prev.logs && typeof prev.logs === 'object' ? prev.logs : {}
            // Defensive merge: overlay incoming data onto the EXISTING log entry
            // from `prev` (the latest queued state). This protects against stale
            // closures in callers — even if the caller constructed `data` from a
            // render-time snapshot that was missing fields, the merge with
            // `existing` preserves them.
            const existing = isRecord((logs as Record<string, unknown>)[key]) ? (logs as Record<string, unknown>)[key] as Record<string, unknown> : {}
            const merged = isRecord(data) ? { ...existing, ...(data as Record<string, unknown>) } : data
            const next: Record<string, unknown> = { ...(prev as Record<string, unknown>), logs: { ...(logs as Record<string, unknown>), [key]: merged } }
            const dataObj = isRecord(data) ? data : null
            const done = !!dataObj?.done
            const ui = isRecord((prev as Record<string, unknown>).ui) ? ((prev as Record<string, unknown>).ui as Record<string, unknown>) : null
            const activeExec = ui && isRecord(ui.activeExecution) ? (ui.activeExecution as Record<string, unknown>) : null
            if (done && activeExec && String(activeExec.key || '').trim() === String(key || '').trim()) {
                next.ui = { ...(ui as Record<string, unknown>), activeExecution: null }
            }
            return next as ActiveWorkoutSession
        })
    }, [])

    const handleStartTimer = useCallback((duration: number, context: unknown) => {
        setActiveSession((prev) => {
            if (!prev) return prev
            return {
                ...prev,
                timerTargetTime: Date.now() + duration * 1000,
                timerContext: context && typeof context === 'object' ? context : null,
            }
        })
    }, [])

    const handleCloseTimer = useCallback(() => {
        setActiveSession((prev) =>
            prev ? { ...prev, timerTargetTime: null, timerContext: null } : prev
        )
    }, [])

    /**
     * Called by RestTimerOverlay.onFinish (and onClose).
     * Calculates restSeconds from restStartMs stored in the log and writes
     * setStartMs = now so the next set's execution time can be tracked.
     */
    const handleTimerFinish = useCallback((context?: unknown) => {
        // 1. Close the timer UI
        setActiveSession((prev) => {
            if (!prev) return prev
            // 2. Read key from context (prefer arg, fall back to stored timerContext)
            const ctx = context && typeof context === 'object' ? context as Record<string, unknown>
                : prev.timerContext && typeof prev.timerContext === 'object' ? prev.timerContext as Record<string, unknown>
                    : null
            const key = ctx?.key ? String(ctx.key) : null
            const now = Date.now()
            let next = { ...prev, timerTargetTime: null as number | null, timerContext: null as unknown }
            if (key) {
                // 3. Find restStartMs in current logs
                const logs = prev.logs && typeof prev.logs === 'object' ? prev.logs as Record<string, unknown> : {}
                const logEntry = logs[key] && typeof logs[key] === 'object' ? logs[key] as Record<string, unknown> : null
                const restStartMs = logEntry && typeof logEntry.restStartMs === 'number' && logEntry.restStartMs > 0 ? logEntry.restStartMs : null
                const patch: Record<string, unknown> = { setStartMs: now }
                if (restStartMs) {
                    const restSec = Math.round((now - restStartMs) / 1000)
                    if (restSec > 0 && restSec < 86400) patch.restSeconds = restSec
                }
                next = {
                    ...next,
                    logs: { ...logs, [key]: { ...(logEntry || {}), ...patch } },
                } as typeof next
            }
            return next as ActiveWorkoutSession
        })
    }, [])

    /** Called by RestTimerOverlay.onStart (user taps START before timer ends) */
    const handleStartFromRestTimer = useCallback((context?: unknown) => {
        handleTimerFinish(context)
    }, [handleTimerFinish])

    const handleFinishSession = useCallback(
        (
            sessionData: unknown,
            showReport: boolean | undefined,
            setView: (v: string) => void,
            setReportData: (d: unknown) => void,
            setReportBackView: (v: string) => void
        ) => {
            suppressForeignFinishToastUntilRef.current = Date.now() + 8000
            try {
                if (userId) {
                    localStorage.removeItem(`irontracks.activeSession.v2.${userId}`)
                }
                localStorage.removeItem('activeSession')
            } catch (e) { logWarn('useActiveSession', 'silenced error', e) }
            setActiveSession(null)
            if (showReport === false) {
                setView('dashboard')
                return
            }
            setReportBackView('dashboard')
            setReportData({ current: sessionData, previous: null })
            setView('report')
        },
        [userId]
    )

    return {
        activeSession,
        setActiveSession,
        suppressForeignFinishToastUntilRef,
        sessionTicker,
        setSessionTicker,
        editActiveOpen,
        setEditActiveOpen,
        editActiveDraft,
        setEditActiveDraft,
        editActiveBaseRef,
        editActiveAddExerciseRef,
        preCheckinOpen,
        setPreCheckinOpen,
        preCheckinWorkout,
        setPreCheckinWorkout,
        preCheckinDraft,
        setPreCheckinDraft,
        preCheckinResolveRef,
        requestPreWorkoutCheckin,
        handleUpdateSessionLog,
        handleStartTimer,
        handleCloseTimer,
        handleTimerFinish,
        handleStartFromRestTimer,
        handleFinishSession,
    }
}

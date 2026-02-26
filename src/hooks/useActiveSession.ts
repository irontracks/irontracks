import { useState, useRef, useCallback } from 'react'
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
    setSessionTicker: React.Dispatch<React.SetStateAction<number>>

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
    const [sessionTicker, setSessionTicker] = useState(0)
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
                setPreCheckinWorkout(isRecord(workout) ? (workout as unknown as ActiveSession) : null)
                setPreCheckinDraft({ energy: '', soreness: '', timeMinutes: '60', notes: '' })
                setPreCheckinOpen(true)
            })
        },
        [preCheckinOpen, userId]
    )

    const handleUpdateSessionLog = useCallback((key: string, data: unknown) => {
        setActiveSession((prev) => {
            if (!prev) return prev
            const logs = prev.logs && typeof prev.logs === 'object' ? prev.logs : {}
            const next: Record<string, unknown> = { ...(prev as unknown as Record<string, unknown>), logs: { ...(logs as Record<string, unknown>), [key]: data } }
            const dataObj = isRecord(data) ? data : null
            const done = !!dataObj?.done
            const ui = isRecord((prev as unknown as Record<string, unknown>).ui) ? ((prev as unknown as Record<string, unknown>).ui as Record<string, unknown>) : null
            const activeExec = ui && isRecord(ui.activeExecution) ? (ui.activeExecution as Record<string, unknown>) : null
            if (done && activeExec && String(activeExec.key || '').trim() === String(key || '').trim()) {
                next.ui = { ...(ui as Record<string, unknown>), activeExecution: null }
            }
            return next as unknown as ActiveWorkoutSession
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
            } catch { }
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
        handleFinishSession,
    }
}

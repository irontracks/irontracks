'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { X, Dumbbell, Timer } from 'lucide-react'
import type { ExerciseSharePayload } from '@/contexts/team/types'
import ExerciseCard from './ExerciseCard'
import { WorkoutProvider } from './WorkoutContext'
import { ModalsComplexMethods } from './ModalsComplexMethods'
import { ModalsSimpleMethods } from './ModalsSimpleMethods'
import { useWorkoutMethodSavers } from './hooks/useWorkoutMethodSavers'
import type { WorkoutExercise, UnknownRecord } from './types'

interface PartnerExerciseOverlayProps {
    share: ExerciseSharePayload
    onSendUpdate: (exerciseIdx: number, setIdx: number, patch: Record<string, unknown>) => void
    onEnd: () => void
}

export default function PartnerExerciseOverlay({ share, onSendUpdate, onEnd }: PartnerExerciseOverlayProps) {
    const exercise = share.exercise || {}
    const exerciseIdx = share.exerciseIdx
    const name = String(exercise.name || '').trim() || `Exercício ${exerciseIdx + 1}`
    const method = String(exercise.method || 'Normal')
    const setsHeader = Math.max(1, Number(exercise.sets) || 0)
    const sdArr: unknown[] = Array.isArray(exercise.setDetails) ? exercise.setDetails as unknown[] : Array.isArray(exercise.set_details) ? exercise.set_details as unknown[] : []
    const setsCount = Math.max(setsHeader, sdArr.length)
    const restTime = Number(exercise.restTime ?? exercise.rest_time ?? 0) || 0

    // ── Local logs state (initialized from shared logs) ─────────────────────
    const [localLogs, setLocalLogs] = useState<Record<string, Record<string, unknown>>>(() => {
        const init: Record<string, Record<string, unknown>> = {}
        const logs = share.logs || {}
        for (let i = 0; i < setsCount; i++) {
            const key = `${exerciseIdx}-${i}`
            const log = logs[key] && typeof logs[key] === 'object' ? logs[key] as Record<string, unknown> : {}
            init[key] = { ...log }
        }
        return init
    })

    // ── Rest timer ──────────────────────────────────────────────────────────
    const [restActive, setRestActive] = useState(false)
    const [restTimeLeft, setRestTimeLeft] = useState(0)
    const restEndRef = useRef(0)

    useEffect(() => {
        if (!restActive) return
        const tick = setInterval(() => {
            const left = Math.max(0, Math.ceil((restEndRef.current - Date.now()) / 1000))
            setRestTimeLeft(left)
            if (left <= 0) {
                setRestActive(false)
                clearInterval(tick)
                try { navigator?.vibrate?.(300) } catch { }
            }
        }, 200)
        return () => clearInterval(tick)
    }, [restActive])

    const startTimer = useCallback((seconds: number) => {
        if (seconds <= 0) return
        restEndRef.current = Date.now() + seconds * 1000
        setRestTimeLeft(seconds)
        setRestActive(true)
    }, [])

    // ── Core context functions ──────────────────────────────────────────────
    const getLog = useCallback((key: string): Record<string, unknown> => {
        return (localLogs[key] || {}) as Record<string, unknown>
    }, [localLogs])

    const updateLog = useCallback((key: string, patch: unknown) => {
        const patchObj = patch && typeof patch === 'object' ? patch as Record<string, unknown> : {}
        setLocalLogs(prev => {
            const prevLog = prev[key] || {}
            const merged = { ...prevLog, ...patchObj }
            return { ...prev, [key]: merged }
        })
        const [exIdxStr, setIdxStr] = key.split('-')
        const exIdx = parseInt(exIdxStr, 10)
        const sIdx = parseInt(setIdxStr, 10)
        if (Number.isFinite(exIdx) && Number.isFinite(sIdx)) {
            onSendUpdate(exIdx, sIdx, patchObj)
        }
        if (patchObj.done === true && restTime > 0) {
            startTimer(restTime)
        }
    }, [onSendUpdate, restTime, startTimer])

    const getPlannedSet = useCallback((ex: WorkoutExercise, setIdx: number) => {
        const sd = Array.isArray(ex?.setDetails) ? ex.setDetails : Array.isArray(ex?.set_details) ? ex.set_details : []
        if (setIdx >= 0 && setIdx < sd.length) return sd[setIdx] as Record<string, unknown>
        return null
    }, [])

    const getPlanConfig = useCallback((ex: WorkoutExercise, setIdx: number) => {
        const planned = getPlannedSet(ex, setIdx)
        if (!planned) return null
        const cfg = (planned as Record<string, unknown>)?.advanced_config ?? (planned as Record<string, unknown>)?.advancedConfig ?? null
        return cfg && typeof cfg === 'object' ? cfg as Record<string, unknown> : null
    }, [getPlannedSet])

    // ── Notes state ─────────────────────────────────────────────────────────
    const [openNotesKeys, setOpenNotesKeys] = useState<Set<string>>(new Set())
    const toggleNotes = useCallback((key: string) => {
        setOpenNotesKeys(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }, [])

    // ── Refs ─────────────────────────────────────────────────────────────────
    const clusterRefs = useRef<Record<string, Array<HTMLInputElement | null>>>({})
    const restPauseRefs = useRef<Record<string, Array<HTMLInputElement | null>>>({})

    // ── Real modal state hooks (for all 13 training methods) ────────────────
    const [clusterModal, setClusterModal] = useState<UnknownRecord | null>(null)
    const [restPauseModal, setRestPauseModal] = useState<UnknownRecord | null>(null)
    const [dropSetModal, setDropSetModal] = useState<UnknownRecord | null>(null)
    const [strippingModal, setStrippingModal] = useState<UnknownRecord | null>(null)
    const [fst7Modal, setFst7Modal] = useState<UnknownRecord | null>(null)
    const [heavyDutyModal, setHeavyDutyModal] = useState<UnknownRecord | null>(null)
    const [pontoZeroModal, setPontoZeroModal] = useState<UnknownRecord | null>(null)
    const [forcedRepsModal, setForcedRepsModal] = useState<UnknownRecord | null>(null)
    const [negativeRepsModal, setNegativeRepsModal] = useState<UnknownRecord | null>(null)
    const [partialRepsModal, setPartialRepsModal] = useState<UnknownRecord | null>(null)
    const [sistema21Modal, setSistema21Modal] = useState<UnknownRecord | null>(null)
    const [waveModal, setWaveModal] = useState<UnknownRecord | null>(null)
    const [groupMethodModal, setGroupMethodModal] = useState<UnknownRecord | null>(null)

    // ── Save functions (from the real hook) ──────────────────────────────────
    const savers = useWorkoutMethodSavers({
        clusterModal, setClusterModal: setClusterModal as never,
        restPauseModal, setRestPauseModal: setRestPauseModal as never,
        dropSetModal, setDropSetModal: setDropSetModal as never,
        strippingModal, setStrippingModal: setStrippingModal as never,
        fst7Modal, setFst7Modal: setFst7Modal as never,
        heavyDutyModal, setHeavyDutyModal: setHeavyDutyModal as never,
        pontoZeroModal, setPontoZeroModal: setPontoZeroModal as never,
        forcedRepsModal, setForcedRepsModal: setForcedRepsModal as never,
        negativeRepsModal, setNegativeRepsModal: setNegativeRepsModal as never,
        partialRepsModal, setPartialRepsModal: setPartialRepsModal as never,
        sistema21Modal, setSistema21Modal: setSistema21Modal as never,
        waveModal, setWaveModal: setWaveModal as never,
        groupMethodModal, setGroupMethodModal: setGroupMethodModal as never,
        getLog: getLog as (key: string) => UnknownRecord,
        updateLog,
    })

    // ── Progress tracking ───────────────────────────────────────────────────
    const doneSets = Object.values(localLogs).filter(l => Boolean(l?.done)).length
    const progressPct = setsCount > 0 ? Math.round((doneSets / setsCount) * 100) : 0

    // ── Build fake workout ──────────────────────────────────────────────────
    const fakeWorkout = useMemo(() => ({
        id: `partner-${share.id}`,
        title: 'Modo Spotter',
        exercises: [exercise],
    }), [share.id, exercise])

    // ── No-op stubs ─────────────────────────────────────────────────────────
    const noop = useCallback(() => {}, [])
    const noopAsync = useCallback(async () => {}, [])
    const noopWithArg = useCallback((_: unknown) => {}, [])
    const noopWithTwoArgs = useCallback((_a: unknown, _b: unknown) => {}, [])

    // ── Full WorkoutContext value ────────────────────────────────────────────
    const contextValue = useMemo(() => ({
        session: { workout: fakeWorkout, logs: localLogs, ui: {} },
        workout: fakeWorkout,
        exercises: [exercise] as WorkoutExercise[],
        logs: localLogs,
        getLog,
        updateLog,
        getPlanConfig,
        getPlannedSet,
        startTimer: (seconds: number) => { startTimer(seconds) },
        collapsed: new Set<number>(),
        toggleCollapse: noop,
        setCurrentExerciseIdx: noopWithArg,
        openNotesKeys,
        toggleNotes,
        setCollapsed: noopWithArg,

        // Reports / Deload
        reportHistoryStatus: null,
        reportHistoryLoadingRef: { current: false },
        reportHistory: null,
        reportHistoryUpdatedAt: null,
        reportHistoryStatusRef: { current: null },
        reportHistoryUpdatedAtRef: { current: null },
        reportHistoryLoadingSinceRef: { current: null },
        deloadSuggestions: {} as Record<string, unknown>,
        openDeloadModal: noopAsync,
        applyDeloadToExercise: noop,
        updateDeloadModalFromPercent: noop,
        updateDeloadModalFromWeight: noop,
        deloadModal: null,
        setDeloadModal: noopWithArg,
        deloadAiCacheRef: { current: {} },

        // Exercise editing
        openEditExercise: noopAsync,
        addExtraSetToExercise: noopWithArg,
        removeExtraSetFromExercise: noopWithArg,
        linkedWeightExercises: new Set<number>(),
        toggleLinkWeights: noopWithArg,

        // Real modal state (not no-ops!)
        clusterModal, setClusterModal: setClusterModal as never,
        restPauseModal, setRestPauseModal: setRestPauseModal as never,
        dropSetModal, setDropSetModal: setDropSetModal as never,
        strippingModal, setStrippingModal: setStrippingModal as never,
        fst7Modal, setFst7Modal: setFst7Modal as never,
        heavyDutyModal, setHeavyDutyModal: setHeavyDutyModal as never,
        pontoZeroModal, setPontoZeroModal: setPontoZeroModal as never,
        forcedRepsModal, setForcedRepsModal: setForcedRepsModal as never,
        negativeRepsModal, setNegativeRepsModal: setNegativeRepsModal as never,
        partialRepsModal, setPartialRepsModal: setPartialRepsModal as never,
        sistema21Modal, setSistema21Modal: setSistema21Modal as never,
        waveModal, setWaveModal: setWaveModal as never,
        groupMethodModal, setGroupMethodModal: setGroupMethodModal as never,

        // Real save functions
        ...savers,

        // Refs
        clusterRefs,
        restPauseRefs,
        organizeBaseKeysRef: { current: [] },

        // Remaining no-ops
        currentExerciseIdx: 0,
        editExerciseOpen: false, setEditExerciseOpen: noopWithArg,
        editExerciseIdx: null, setEditExerciseIdx: noopWithArg,
        editExerciseDraft: null, setEditExerciseDraft: noopWithArg,
        saveEditExercise: noopAsync,
        addExtraExerciseToWorkout: noopAsync,
        openOrganizeModal: noop,
        requestCloseOrganize: noop,
        saveOrganize: noop,
        organizeOpen: false, setOrganizeOpen: noopWithArg,
        organizeDraft: null, setOrganizeDraft: noopWithArg,
        organizeSaving: false, organizeDirty: false,
        organizeError: '', setOrganizeError: noopWithArg,
        finishWorkout: noopAsync,
        timerMinimized: false, setTimerMinimized: noopWithArg,
        postCheckinOpen: false, setPostCheckinOpen: noopWithArg,
        postCheckinDraft: null, setPostCheckinDraft: noopWithArg,
        postCheckinResolveRef: { current: null },
        addExerciseOpen: false, setAddExerciseOpen: noopWithArg,
        addExerciseDraft: null, setAddExerciseDraft: noopWithArg,

        // UI helpers
        handleTimerFinish: noop,
        alert: async (msg: string) => { try { window.alert(msg) } catch {} },
        confirm: async () => true,
        HELP_TERMS: {},
        currentExercise: exercise,
        elapsedSeconds: 0,
        formatElapsed: () => '0:00',
        onFinish: noop,
        sendInvite: noopWithTwoArgs,
        completedSets: doneSets,
        totalSets: setsCount,
        progressPct,
        remainingSets: setsCount - doneSets,
        ui: {} as UnknownRecord,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [
        exercise, fakeWorkout, localLogs, getLog, updateLog, getPlanConfig, getPlannedSet,
        startTimer, openNotesKeys, toggleNotes, noop, noopAsync, noopWithArg, noopWithTwoArgs,
        doneSets, setsCount, progressPct, savers,
        clusterModal, restPauseModal, dropSetModal, strippingModal, fst7Modal,
        heavyDutyModal, pontoZeroModal, forcedRepsModal, negativeRepsModal,
        partialRepsModal, sistema21Modal, waveModal, groupMethodModal,
    ])

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m}:${String(sec).padStart(2, '0')}`
    }

    return (
        <div className="fixed inset-0 z-[1500] bg-black/95 backdrop-blur-xl flex flex-col">
            {/* Header */}
            <div className="relative px-4 pt-safe pb-3 border-b border-indigo-500/30 bg-gradient-to-b from-indigo-950/50 to-transparent">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />
                <div className="flex items-center justify-between gap-3 mt-2">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-purple-600/15 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/10">
                            <Dumbbell size={18} className="text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400/70 leading-none mb-0.5">Modo Spotter</div>
                            <h2 className="font-black text-white text-lg leading-snug truncate">{name}</h2>
                            <div className="text-[11px] text-indigo-300/60 font-bold">
                                Controlando para <span className="text-indigo-300">{share.fromName}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onEnd}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-black uppercase tracking-wider transition-all active:scale-95"
                    >
                        <X size={14} />
                        Sair
                    </button>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-1 w-full bg-neutral-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500 font-bold">
                    <span>{doneSets}/{setsCount} séries</span>
                    <span>{method}</span>
                </div>
            </div>

            {/* Rest timer banner */}
            {restActive && (
                <div className="px-4 py-3 bg-indigo-600/20 border-b border-indigo-500/20 flex items-center justify-center gap-3">
                    <Timer size={16} className="text-indigo-400 animate-pulse" />
                    <span className="font-mono font-black text-xl text-indigo-300 tabular-nums">{formatTime(restTimeLeft)}</span>
                    <span className="text-xs text-indigo-400/60 font-bold uppercase">descanso</span>
                </div>
            )}

            {/* Exercise card + method modals — all inside WorkoutProvider */}
            <WorkoutProvider value={contextValue as never}>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                    <ExerciseCard
                        ex={exercise as WorkoutExercise}
                        exIdx={exerciseIdx}
                    />
                </div>
                {/* Method modals — wrap in z-[2000] so they render ABOVE the z-[1500] overlay */}
                <div className="fixed inset-0 z-[2000] pointer-events-none [&>*]:pointer-events-auto">
                    <ModalsComplexMethods />
                    <ModalsSimpleMethods />
                </div>
            </WorkoutProvider>

            {/* Footer */}
            <div className="px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] border-t border-indigo-500/20 bg-neutral-950/80">
                <button
                    onClick={onEnd}
                    className={[
                        'w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98]',
                        doneSets >= setsCount
                            ? 'bg-gradient-to-r from-emerald-500 to-green-400 text-black shadow-lg shadow-emerald-500/25'
                            : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/25',
                    ].join(' ')}
                >
                    {doneSets >= setsCount ? '✅ Concluir Exercício' : `Devolver Controle (${doneSets}/${setsCount})`}
                </button>
            </div>
        </div>
    )
}

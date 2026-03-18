'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Check, Dumbbell, Timer, Send } from 'lucide-react'
import type { ExerciseSharePayload } from '@/contexts/team/types'

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
    const notes = String(exercise.notes || '').trim()
    const repsPlanned = String(exercise.reps ?? '')

    // Local logs state — initialized from shared logs
    const [localLogs, setLocalLogs] = useState<Record<string, { weight: string; reps: string; done: boolean }>>(() => {
        const init: Record<string, { weight: string; reps: string; done: boolean }> = {}
        const logs = share.logs || {}
        for (let i = 0; i < setsCount; i++) {
            const key = `${exerciseIdx}-${i}`
            const log = logs[key] && typeof logs[key] === 'object' ? logs[key] as Record<string, unknown> : {}
            init[key] = {
                weight: String(log.weight ?? ''),
                reps: String(log.reps ?? ''),
                done: Boolean(log.done),
            }
        }
        return init
    })

    // Rest timer
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
                try {
                    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(300)
                } catch { }
            }
        }, 200)
        return () => clearInterval(tick)
    }, [restActive])

    const startRest = useCallback(() => {
        if (restTime <= 0) return
        restEndRef.current = Date.now() + restTime * 1000
        setRestTimeLeft(restTime)
        setRestActive(true)
    }, [restTime])

    const handleSetDone = useCallback((setIdx: number) => {
        const key = `${exerciseIdx}-${setIdx}`
        setLocalLogs(prev => {
            const current = prev[key] || { weight: '', reps: '', done: false }
            const updated = { ...current, done: !current.done }
            // Send update to partner
            onSendUpdate(exerciseIdx, setIdx, { weight: updated.weight, reps: updated.reps, done: updated.done })
            // Start rest timer if marking as done
            if (updated.done && restTime > 0) startRest()
            return { ...prev, [key]: updated }
        })
    }, [exerciseIdx, onSendUpdate, restTime, startRest])

    const handleFieldChange = useCallback((setIdx: number, field: 'weight' | 'reps', value: string) => {
        const key = `${exerciseIdx}-${setIdx}`
        setLocalLogs(prev => {
            const current = prev[key] || { weight: '', reps: '', done: false }
            const updated = { ...current, [field]: value }
            return { ...prev, [key]: updated }
        })
    }, [exerciseIdx])

    const handleFieldBlur = useCallback((setIdx: number) => {
        const key = `${exerciseIdx}-${setIdx}`
        const log = localLogs[key]
        if (log) {
            onSendUpdate(exerciseIdx, setIdx, { weight: log.weight, reps: log.reps, done: log.done })
        }
    }, [exerciseIdx, localLogs, onSendUpdate])

    const doneSets = Object.values(localLogs).filter(l => l.done).length
    const progressPct = setsCount > 0 ? Math.round((doneSets / setsCount) * 100) : 0

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
                    <span>{method} • {repsPlanned || '—'} reps • {restTime ? `${restTime}s` : '—'}</span>
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

            {/* Exercise notes */}
            {notes && (
                <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-neutral-900/50 border border-yellow-500/20">
                    <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-snug">{notes}</p>
                </div>
            )}

            {/* Sets list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {Array.from({ length: setsCount }).map((_, setIdx) => {
                    const key = `${exerciseIdx}-${setIdx}`
                    const log = localLogs[key] || { weight: '', reps: '', done: false }
                    const isDone = log.done
                    return (
                        <div
                            key={key}
                            className={[
                                'rounded-2xl border p-4 transition-all duration-200',
                                isDone
                                    ? 'bg-emerald-500/[0.06] border-emerald-500/30'
                                    : 'bg-white/[0.02] border-white/[0.07]',
                            ].join(' ')}
                        >
                            <div className="flex items-center gap-3">
                                {/* Set number */}
                                <span className={[
                                    'flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black border',
                                    isDone
                                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                        : 'bg-indigo-500/15 border-indigo-500/25 text-indigo-400',
                                ].join(' ')}>
                                    {isDone ? <Check size={14} /> : setIdx + 1}
                                </span>

                                {/* Weight input */}
                                <div className="flex-1">
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Peso (kg)</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        value={log.weight}
                                        onChange={(e) => handleFieldChange(setIdx, 'weight', e.target.value)}
                                        onBlur={() => handleFieldBlur(setIdx)}
                                        placeholder="—"
                                        className="w-full bg-neutral-800/80 border border-neutral-700/50 rounded-lg px-3 py-2 text-white text-sm font-mono text-center focus:outline-none focus:border-indigo-500/50 transition-colors"
                                        disabled={isDone}
                                    />
                                </div>

                                {/* Reps input */}
                                <div className="flex-1">
                                    <label className="block text-[9px] font-black uppercase tracking-widest text-neutral-500 mb-0.5">Reps</label>
                                    <input
                                        type="number"
                                        value={log.reps}
                                        onChange={(e) => handleFieldChange(setIdx, 'reps', e.target.value)}
                                        onBlur={() => handleFieldBlur(setIdx)}
                                        placeholder={repsPlanned || '—'}
                                        className="w-full bg-neutral-800/80 border border-neutral-700/50 rounded-lg px-3 py-2 text-white text-sm font-mono text-center focus:outline-none focus:border-indigo-500/50 transition-colors"
                                        disabled={isDone}
                                    />
                                </div>

                                {/* Done button */}
                                <button
                                    onClick={() => handleSetDone(setIdx)}
                                    className={[
                                        'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm transition-all active:scale-95 border',
                                        isDone
                                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                            : 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25',
                                    ].join(' ')}
                                    aria-label={isDone ? 'Desmarcar série' : 'Marcar série como feita'}
                                >
                                    {isDone ? <Check size={18} /> : <Send size={14} />}
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>

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

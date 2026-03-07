'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Swords, X, Flame } from 'lucide-react'
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext'

export interface SetChallenge {
    id: string
    fromUserId: string
    fromName: string
    exName: string
    weight: number
    reps: number
    ts: number
}

interface TeamSetChallengeProps {
    /** Current exercise name (for issuing challenges) */
    currentExName?: string
    /** Current best set weight in session */
    currentWeight?: number
    /** Current best set reps in session */
    currentReps?: number
    /** Called when local user wants to beat a challenge */
    onBeatChallenge?: (challenge: SetChallenge) => void
}

/**
 * TeamSetChallenge — Send and receive live set challenges during a team workout.
 * A challenge toast appears when a partner dares you to beat their set.
 * Uses the existing team_logs broadcast channel with event 'set_challenge'.
 */
export function TeamSetChallenge({ currentExName, currentWeight, currentReps, onBeatChallenge }: TeamSetChallengeProps) {
    const teamCtx = useTeamWorkout() as unknown as {
        teamSession: { id: string } | null
        sendSetChallenge?: (exName: string, weight: number, reps: number) => void
        pendingChallenge: SetChallenge | null
        dismissChallenge: () => void
    }
    const { teamSession, pendingChallenge, dismissChallenge } = teamCtx

    const [beatSent, setBeatSent] = useState(false)

    // Auto-dismiss after 15s
    useEffect(() => {
        if (!pendingChallenge) { setBeatSent(false); return }
        const t = setTimeout(() => dismissChallenge(), 15_000)
        return () => clearTimeout(t)
    }, [pendingChallenge, dismissChallenge])

    const handleBeat = useCallback(() => {
        if (!pendingChallenge) return
        setBeatSent(true)
        onBeatChallenge?.(pendingChallenge)
        setTimeout(() => dismissChallenge(), 2_000)
    }, [pendingChallenge, onBeatChallenge, dismissChallenge])

    if (!teamSession?.id) return null

    return (
        <>
            {/* Issue challenge button (shown when in a team session with exercise selected) */}
            {currentExName && (currentWeight || currentReps) && teamCtx.sendSetChallenge && (
                <button
                    onClick={() => teamCtx.sendSetChallenge!(currentExName, currentWeight ?? 0, currentReps ?? 0)}
                    className="flex items-center gap-1.5 text-[11px] font-black text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-1.5 hover:bg-orange-500/20 transition-colors active:scale-95"
                >
                    <Swords size={12} />
                    Desafiar
                </button>
            )}

            {/* Incoming challenge toast */}
            {pendingChallenge && (
                <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[80] w-80 max-w-[90vw] animate-fade-in">
                    <div className="rounded-2xl border border-red-500/40 bg-neutral-900/98 backdrop-blur-md shadow-2xl shadow-red-900/30 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 pt-3 pb-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <Swords size={13} className="text-red-400" />
                                </div>
                                <div>
                                    <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide">Desafio recebido!</p>
                                    <p className="text-xs text-neutral-300 font-bold">{pendingChallenge.fromName} te desafiou</p>
                                </div>
                            </div>
                            <button onClick={dismissChallenge} className="text-neutral-500 hover:text-white p-1">
                                <X size={14} />
                            </button>
                        </div>

                        {/* Challenge details */}
                        <div className="mx-4 mb-3 rounded-xl bg-neutral-800/60 px-3 py-2.5 flex items-center gap-3">
                            <Flame size={18} className="text-orange-400 shrink-0" />
                            <div>
                                <p className="text-xs font-bold text-white truncate">{pendingChallenge.exName}</p>
                                <p className="text-[11px] text-neutral-300">
                                    <span className="text-orange-300 font-black">{pendingChallenge.weight > 0 ? `${pendingChallenge.weight}kg` : ''}</span>
                                    {pendingChallenge.weight > 0 && pendingChallenge.reps > 0 && ' × '}
                                    <span className="text-orange-300 font-black">{pendingChallenge.reps > 0 ? `${pendingChallenge.reps} reps` : ''}</span>
                                    <span className="text-neutral-500 ml-1 text-[9px]">— consegue superar?</span>
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                            <button
                                onClick={dismissChallenge}
                                className="py-2.5 rounded-xl bg-neutral-800 text-neutral-300 text-xs font-bold hover:bg-neutral-700 transition-colors"
                            >
                                Agora não
                            </button>
                            <button
                                onClick={handleBeat}
                                disabled={beatSent}
                                className="py-2.5 rounded-xl bg-red-500 text-white text-xs font-black shadow-lg hover:bg-red-400 transition-colors disabled:opacity-60 active:scale-95"
                            >
                                {beatSent ? 'Aceito! 💪' : '🔥 Aceitar Desafio'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

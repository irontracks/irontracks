'use client'
import React, { useMemo } from 'react'
import { Trophy, Zap, Target, TrendingUp, X } from 'lucide-react'
import Image from 'next/image'

export interface SessionParticipantResult {
    userId: string
    displayName: string
    photoURL: string | null
    totalVolume: number       // kg·reps
    setsCompleted: number
    prsAchieved: number
    topExercise: string | null
    topWeight: number | null
}

export interface TeamWorkoutReportProps {
    sessionId: string
    workoutName: string
    durationMinutes: number
    participants: SessionParticipantResult[]
    myUserId: string
    onClose: () => void
}

function fmtKg(v: number) {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`
}
function fmtVol(v: number) {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))
}

const PODIUM_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']
const PODIUM_LABELS = ['🥇', '🥈', '🥉']

/**
 * TeamWorkoutReport — post-session comparative report for team workouts.
 * Shows ranking by total volume, PRs per participant, MVP badge,
 * peak weight per person, and sets completed. Shareable card design.
 */
export function TeamWorkoutReport({ workoutName, durationMinutes, participants, myUserId, onClose }: TeamWorkoutReportProps) {
    const ranked = useMemo(() => {
        return [...participants].sort((a, b) => b.totalVolume - a.totalVolume)
    }, [participants])

    const mvp = ranked[0] ?? null
    const totalVolume = participants.reduce((s, p) => s + p.totalVolume, 0)
    const totalPRs = participants.reduce((s, p) => s + p.prsAchieved, 0)
    const totalSets = participants.reduce((s, p) => s + p.setsCompleted, 0)

    return (
        <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 pt-safe pb-safe overflow-y-auto">
            <div className="w-full max-w-sm mx-auto">
                {/* Header */}
                <div className="relative bg-gradient-to-b from-neutral-800 to-neutral-900 rounded-3xl border border-yellow-500/40 shadow-2xl overflow-hidden">
                    {/* Close */}
                    <button onClick={onClose} className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center hover:bg-neutral-600 transition-colors">
                        <X size={14} className="text-white" />
                    </button>

                    {/* Top glow */}
                    <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />

                    <div className="p-6 pb-4 text-center relative">
                        <div className="w-14 h-14 rounded-2xl bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center mx-auto mb-3">
                            <Trophy size={24} className="text-yellow-400" />
                        </div>
                        <h2 className="text-xl font-black text-white">Resultado da Equipe</h2>
                        <p className="text-sm text-neutral-400 mt-0.5 truncate">{workoutName}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">{durationMinutes}min · {participants.length} participante{participants.length !== 1 ? 's' : ''}</p>
                    </div>

                    {/* Team stats bar */}
                    <div className="flex border-t border-neutral-800 divide-x divide-neutral-800">
                        {[
                            { label: 'Volume total', value: fmtVol(totalVolume), icon: <TrendingUp size={12} /> },
                            { label: 'PRs', value: String(totalPRs), icon: <Zap size={12} /> },
                            { label: 'Séries', value: String(totalSets), icon: <Target size={12} /> },
                        ].map(item => (
                            <div key={item.label} className="flex-1 py-3 flex flex-col items-center gap-0.5">
                                <div className="flex items-center gap-1 text-neutral-400">{item.icon}<span className="text-[9px] uppercase tracking-wide">{item.label}</span></div>
                                <span className="text-base font-black text-white">{item.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* MVP banner */}
                    {mvp && (
                        <div className="mx-4 my-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-3 px-3 py-2">
                            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-yellow-500 shrink-0">
                                {mvp.photoURL ? (
                                    <Image src={mvp.photoURL} alt={mvp.displayName} width={32} height={32} className="object-cover" unoptimized />
                                ) : (
                                    <div className="w-full h-full bg-yellow-500 flex items-center justify-center text-[11px] font-black text-black">{mvp.displayName[0]?.toUpperCase()}</div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] text-yellow-500 font-bold uppercase tracking-wide">MVP 🏆</p>
                                <p className="text-sm font-black text-white truncate">{mvp.userId === myUserId ? 'VOCÊ!' : mvp.displayName}</p>
                            </div>
                            <div className="ml-auto text-right shrink-0">
                                <p className="text-xs font-black text-yellow-300">{fmtVol(mvp.totalVolume)}</p>
                                <p className="text-[9px] text-neutral-500">vol. total</p>
                            </div>
                        </div>
                    )}

                    {/* Ranking */}
                    <div className="px-4 pb-4 space-y-2">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-2">Ranking por Volume</p>
                        {ranked.map((p, i) => {
                            const isMe = p.userId === myUserId
                            const pct = mvp && mvp.totalVolume > 0 ? (p.totalVolume / mvp.totalVolume) * 100 : 0
                            return (
                                <div key={p.userId} className={`rounded-xl p-3 border ${isMe ? 'border-yellow-500/40 bg-yellow-500/8' : 'border-neutral-800 bg-neutral-800/40'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {/* Rank badge */}
                                        <span className="text-base w-6 shrink-0 text-center">{i < 3 ? PODIUM_LABELS[i] : `#${i + 1}`}</span>
                                        {/* Avatar */}
                                        <div className="w-7 h-7 rounded-full overflow-hidden border shrink-0" style={{ borderColor: i < 3 ? PODIUM_COLORS[i] : '#525252' }}>
                                            {p.photoURL ? (
                                                <Image src={p.photoURL} alt={p.displayName} width={28} height={28} className="object-cover" unoptimized />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-[10px] font-black" style={{ background: i < 3 ? PODIUM_COLORS[i] + '33' : '#404040', color: i < 3 ? PODIUM_COLORS[i] : '#9ca3af' }}>
                                                    {p.displayName[0]?.toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-white truncate">{isMe ? `${p.displayName} (você)` : p.displayName}</p>
                                            {p.topExercise && (
                                                <p className="text-[9px] text-neutral-500 truncate">⬆ {p.topExercise}{p.topWeight ? ` · ${fmtKg(p.topWeight)}` : ''}</p>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-black text-white">{fmtVol(p.totalVolume)}</p>
                                            <p className="text-[9px] text-neutral-500">{p.setsCompleted}s · {p.prsAchieved}PR</p>
                                        </div>
                                    </div>
                                    {/* Volume bar */}
                                    <div className="h-1.5 rounded-full bg-neutral-700 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${pct}%`, background: i < 3 ? PODIUM_COLORS[i] : '#525252' }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Footer CTA */}
                    <div className="px-4 pb-5">
                        <button
                            onClick={onClose}
                            className="w-full py-3 rounded-xl bg-yellow-500 text-black font-black text-sm hover:bg-yellow-400 transition-colors"
                        >
                            Fechar relatório
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

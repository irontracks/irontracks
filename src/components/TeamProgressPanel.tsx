'use client'
import React, { useState, useMemo } from 'react'
import { Users, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext'
import type { SharedLogsMap } from '@/contexts/TeamWorkoutContext'

interface Exercise {
    name?: string
}

interface TeamProgressPanelProps {
    /** exercises array from the active workout */
    exercises: Exercise[]
    /** participant display name/photo lookup keyed by userId */
    participants?: Array<{ user_id?: string; display_name?: string; photo_url?: string | null }>
}

/**
 * TeamProgressPanel — shows partner's live set progress during a team workout.
 * Reads sharedLogs from TeamWorkoutContext and renders a collapsible panel
 * with each partner's exercise/set progress in real time.
 */
export function TeamProgressPanel({ exercises, participants }: TeamProgressPanelProps) {
    const { sharedLogs, teamSession, presence } = useTeamWorkout()
    const [collapsed, setCollapsed] = useState(false)

    const partnerIds = useMemo(() => {
        return Object.keys(sharedLogs ?? {})
    }, [sharedLogs])

    const sessionParticipants = teamSession?.participants ?? []

    const getParticipantName = (uid: string) => {
        // Try explicit prop first, then session participants
        const fromProp = Array.isArray(participants) ? participants.find(p => String(p.user_id || '') === uid) : null
        if (fromProp?.display_name) return fromProp.display_name
        const fromSession = sessionParticipants.find(p => String(p.user_id || p.id || '') === uid)
        return String(fromSession?.display_name || 'Parceiro').trim()
    }

    if (!teamSession?.id || partnerIds.length === 0) return null

    return (
        <div className="fixed bottom-4 right-4 z-50 w-72 max-w-[90vw] rounded-2xl border border-yellow-500/40 bg-neutral-900/95 backdrop-blur-md shadow-2xl shadow-yellow-900/30 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setCollapsed(c => !c)}
                className="w-full flex items-center justify-between px-4 py-3 border-b border-neutral-800 text-left"
            >
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center">
                        <Users size={12} className="text-black" />
                    </div>
                    <span className="text-sm font-black text-yellow-400 uppercase tracking-wider">Equipe ao vivo</span>
                    <span className="text-[10px] font-mono text-neutral-500">({partnerIds.length} parceiro{partnerIds.length !== 1 ? 's' : ''})</span>
                </div>
                {collapsed ? <ChevronDown size={14} className="text-neutral-400" /> : <ChevronUp size={14} className="text-neutral-400" />}
            </button>

            {!collapsed && (
                <div className="p-3 space-y-3 max-h-72 overflow-y-auto">
                    {partnerIds.map((uid) => {
                        const name = getParticipantName(uid)
                        const logs = (sharedLogs as SharedLogsMap)[uid] ?? {}
                        const logEntries = Object.values(logs).sort((a, b) => b.ts - a.ts)
                        const presenceStatus = presence[uid]?.status ?? 'online'

                        return (
                            <div key={uid} className="rounded-xl border border-neutral-800 bg-neutral-800/50 p-3">
                                {/* Partner header */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${presenceStatus === 'online' ? 'bg-green-400' : presenceStatus === 'away' ? 'bg-yellow-400' : 'bg-neutral-500'}`} />
                                        <span className="text-xs font-bold text-white truncate max-w-[140px]">{name}</span>
                                    </div>
                                    <Zap size={10} className="text-yellow-400 shrink-0" />
                                </div>

                                {/* Recent sets */}
                                {logEntries.length === 0 ? (
                                    <p className="text-[10px] text-neutral-500 italic">Aguardando primeira série…</p>
                                ) : (
                                    <div className="space-y-1">
                                        {logEntries.slice(0, 6).map((entry) => {
                                            const exName = exercises[entry.exIdx]?.name ?? `Ex ${entry.exIdx + 1}`
                                            const hasWeight = entry.weight && entry.weight !== '0' && entry.weight !== ''
                                            const hasReps = entry.reps && entry.reps !== '0' && entry.reps !== ''
                                            return (
                                                <div key={`${entry.exIdx}-${entry.sIdx}`} className="flex items-center justify-between text-[10px] font-mono">
                                                    <span className="text-neutral-400 truncate max-w-[120px]">
                                                        {exName} · série {entry.sIdx + 1}
                                                    </span>
                                                    <span className="text-green-300 font-bold shrink-0">
                                                        {hasWeight && `${entry.weight}kg`}{hasWeight && hasReps && ' × '}{hasReps && `${entry.reps}r`}
                                                        {!hasWeight && !hasReps && '—'}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

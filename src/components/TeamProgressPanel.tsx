'use client'
import React, { useState, useMemo } from 'react'
import { Users, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext'
import type { SharedLogsMap } from '@/contexts/TeamWorkoutContext'

interface Exercise {
    name?: string
}

interface TeamProgressPanelProps {
    exercises: Exercise[]
    participants?: Array<{ user_id?: string; display_name?: string; photo_url?: string | null }>
}

/**
 * TeamProgressPanel — inline collapsible banner shown at the top of the exercise
 * scroll area (NOT fixed/floating). Shows partner's live set progress.
 */
export function TeamProgressPanel({ exercises, participants }: TeamProgressPanelProps) {
    const { sharedLogs, teamSession, presence } = useTeamWorkout()
    const [collapsed, setCollapsed] = useState(false)

    const partnerIds = useMemo(() => {
        return Object.keys(sharedLogs ?? {})
    }, [sharedLogs])

    const sessionParticipants = teamSession?.participants ?? []

    const getParticipantName = (uid: string) => {
        const fromProp = Array.isArray(participants) ? participants.find(p => String(p.user_id || '') === uid) : null
        if (fromProp?.display_name) return fromProp.display_name
        const fromSession = sessionParticipants.find(p => String(p.user_id || p.id || '') === uid)
        return String(fromSession?.display_name || 'Parceiro').trim()
    }

    if (!teamSession?.id || partnerIds.length === 0) return null

    return (
        <div className="mx-4 mb-3 rounded-2xl border border-yellow-500/30 bg-neutral-900 overflow-hidden">
            {/* Header — always visible */}
            <button
                onClick={() => setCollapsed(c => !c)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left"
            >
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center shrink-0">
                        <Users size={10} className="text-black" />
                    </div>
                    <span className="text-xs font-black text-yellow-400 uppercase tracking-wider">Equipe ao vivo</span>
                    <span className="text-[10px] text-neutral-500">
                        {partnerIds.length} parceiro{partnerIds.length !== 1 ? 's' : ''}
                    </span>
                </div>
                {collapsed
                    ? <ChevronDown size={13} className="text-neutral-500 shrink-0" />
                    : <ChevronUp size={13} className="text-neutral-500 shrink-0" />
                }
            </button>

            {/* Content — collapsible */}
            {!collapsed && (
                <div className="border-t border-neutral-800 px-3 pb-3 pt-2 grid grid-cols-1 gap-2">
                    {partnerIds.map((uid) => {
                        const name = getParticipantName(uid)
                        const logs = (sharedLogs as SharedLogsMap)[uid] ?? {}
                        const logEntries = Object.values(logs).sort((a, b) => b.ts - a.ts)
                        const presenceStatus = presence[uid]?.status ?? 'online'
                        const dotColor = presenceStatus === 'online' ? 'bg-green-400' : presenceStatus === 'away' ? 'bg-yellow-400' : 'bg-neutral-500'

                        return (
                            <div key={uid} className="rounded-xl bg-neutral-800/60 border border-neutral-800 px-3 py-2">
                                {/* Partner header */}
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                                        <span className="text-xs font-bold text-white truncate max-w-[160px]">{name}</span>
                                    </div>
                                    <Zap size={10} className="text-yellow-400 shrink-0" />
                                </div>

                                {logEntries.length === 0 ? (
                                    <p className="text-[10px] text-neutral-500 italic">Aguardando primeira série…</p>
                                ) : (
                                    <div className="space-y-0.5">
                                        {logEntries.slice(0, 4).map((entry) => {
                                            const exName = exercises[entry.exIdx]?.name ?? `Ex ${entry.exIdx + 1}`
                                            const hasWeight = entry.weight && entry.weight !== '0' && entry.weight !== ''
                                            const hasReps = entry.reps && entry.reps !== '0' && entry.reps !== ''
                                            return (
                                                <div key={`${entry.exIdx}-${entry.sIdx}`} className="flex items-center justify-between text-[10px] font-mono">
                                                    <span className="text-neutral-400 truncate max-w-[130px]">
                                                        {exName} · série {entry.sIdx + 1}
                                                    </span>
                                                    <span className="text-green-300 font-bold shrink-0 ml-2">
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

'use client'
import React, { useMemo, useState } from 'react'
import { Flame, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react'
import Image from 'next/image'
import { useTeamWorkout } from '@/contexts/TeamWorkoutContext'
import type { SharedLogsMap } from '@/contexts/TeamWorkoutContext'

interface Participant {
    user_id?: string
    id?: string
    display_name?: string
    photo_url?: string | null
}

interface TeamLiveRankingProps {
    myUserId: string
    myDisplayName: string
    myPhotoURL?: string | null
    myLogs: Record<string, { weight?: string | number; reps?: string | number }>
    participants?: Participant[]
}

interface RankEntry {
    userId: string
    displayName: string
    photoURL: string | null
    volume: number
    setsLogged: number
}

function calcVolume(logs: Record<string, { weight?: string | number; reps?: string | number }>) {
    let vol = 0
    for (const v of Object.values(logs)) {
        const w = Number(v?.weight ?? 0)
        const r = Number(v?.reps ?? 0)
        if (w > 0 && r > 0) vol += w * r
    }
    return vol
}
function fmtVol(v: number) { return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)) }

/**
 * TeamLiveRanking — Real-time volume ranking during a team workout session.
 * Uses the existing sharedLogs broadcast state (zero new events needed).
 * Shows a collapsible floating panel with live rankings.
 */
export function TeamLiveRanking({ myUserId, myDisplayName, myPhotoURL, myLogs, participants }: TeamLiveRankingProps) {
    const { sharedLogs, teamSession } = useTeamWorkout() as unknown as {
        sharedLogs: SharedLogsMap
        teamSession: { id: string } | null
    }
    const [collapsed, setCollapsed] = useState(false)

    const ranked: RankEntry[] = useMemo(() => {
        const entries: RankEntry[] = []

        // My own volume
        const myVol = calcVolume(myLogs ?? {})
        entries.push({
            userId: myUserId,
            displayName: myDisplayName || 'Você',
            photoURL: myPhotoURL ?? null,
            volume: myVol,
            setsLogged: Object.keys(myLogs ?? {}).filter(k => {
                const v = (myLogs ?? {})[k]
                return Number(v?.weight ?? 0) > 0 || Number(v?.reps ?? 0) > 0
            }).length,
        })

        // Partners from sharedLogs
        for (const [uid, logs] of Object.entries(sharedLogs ?? {})) {
            const part = Array.isArray(participants) ? participants.find(p => String(p.user_id || p.id || '') === uid) : null
            const name = String(part?.display_name || 'Parceiro')
            const photo = part?.photo_url ?? null
            const logsMapped = Object.fromEntries(
                Object.entries(logs).map(([k, v]) => [k, { weight: v.weight, reps: v.reps }])
            )
            entries.push({
                userId: uid,
                displayName: name,
                photoURL: photo,
                volume: calcVolume(logsMapped),
                setsLogged: Object.values(logs).length,
            })
        }

        return entries.sort((a, b) => b.volume - a.volume)
    }, [sharedLogs, myUserId, myDisplayName, myPhotoURL, myLogs, participants])

    if (!teamSession?.id || ranked.length <= 1) return null

    const leader = ranked[0]
    const myRank = ranked.findIndex(r => r.userId === myUserId) + 1
    const isLeading = myRank === 1

    return (
        <div className="fixed top-20 right-4 z-[55] w-56 rounded-2xl border border-orange-500/30 bg-neutral-900/95 backdrop-blur-md shadow-xl shadow-orange-900/20 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setCollapsed(c => !c)}
                className="w-full flex items-center justify-between px-3 py-2 border-b border-neutral-800"
            >
                <div className="flex items-center gap-1.5">
                    <Flame size={12} className="text-orange-400" />
                    <span className="text-[11px] font-black text-orange-400 uppercase tracking-wide">Ranking ao vivo</span>
                    {isLeading && <span className="text-[9px] bg-orange-500/20 text-orange-300 px-1.5 rounded-full font-bold">Líder 🔥</span>}
                </div>
                {collapsed ? <ChevronDown size={11} className="text-neutral-500" /> : <ChevronUp size={11} className="text-neutral-500" />}
            </button>

            {!collapsed && (
                <div className="p-2 space-y-1">
                    {ranked.map((entry, i) => {
                        const isMe = entry.userId === myUserId
                        const leaderVol = leader.volume
                        const pct = leaderVol > 0 ? (entry.volume / leaderVol) * 100 : 0
                        const medals = ['🥇', '🥈', '🥉']
                        return (
                            <div key={entry.userId} className={`rounded-xl px-2.5 py-2 ${isMe ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-neutral-800/50'}`}>
                                <div className="flex items-center gap-2">
                                    {/* Rank */}
                                    <span className="text-sm shrink-0 w-5 text-center">{i < 3 ? medals[i] : `${i + 1}`}</span>
                                    {/* Avatar */}
                                    <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-neutral-700">
                                        {entry.photoURL ? (
                                            <Image src={entry.photoURL} alt={entry.displayName} width={20} height={20} className="object-cover" unoptimized />
                                        ) : (
                                            <div className={`w-full h-full flex items-center justify-center text-[8px] font-black ${isMe ? 'bg-orange-500 text-black' : 'bg-neutral-600 text-white'}`}>
                                                {entry.displayName[0]?.toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    {/* Name + volume */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className={`text-[10px] font-bold truncate ${isMe ? 'text-orange-300' : 'text-white'}`}>
                                                {isMe ? 'Você' : entry.displayName}
                                            </span>
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                <TrendingUp size={8} className="text-neutral-500" />
                                                <span className="text-[10px] font-mono text-neutral-300">{fmtVol(entry.volume)}</span>
                                            </div>
                                        </div>
                                        {/* Volume bar */}
                                        <div className="h-1 rounded-full bg-neutral-700 mt-1 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500"
                                                style={{
                                                    width: `${pct}%`,
                                                    background: isMe ? '#f97316' : i === 0 ? '#FFD700' : '#525252'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

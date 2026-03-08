'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { Users, Clock, TrendingUp, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/utils/supabase/client'
import { logError } from '@/lib/logger'

export interface TeamSessionRecord {
    id: string
    createdAt: string
    workoutName: string
    durationMinutes: number
    participantCount: number
    myVolume: number
    participants: Array<{ displayName: string; photoURL: string | null; volume: number }>
    isHost: boolean
}

interface TeamSessionHistoryProps {
    userId: string
    onSelectSession?: (session: TeamSessionRecord) => void
    limit?: number
}

function fmtDate(iso: string) {
    try {
        const d = new Date(iso)
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return iso }
}
function fmtVol(v: number) {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))
}

/**
 * TeamSessionHistory — fetches and displays past team workout sessions.
 * Shows workout name, date, participant avatars, total duration, and personal volume.
 * Tapping a session calls onSelectSession for deeper analysis.
 */
export function TeamSessionHistory({ userId, onSelectSession, limit = 20 }: TeamSessionHistoryProps) {
    const [sessions, setSessions] = useState<TeamSessionRecord[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchSessions = useCallback(async () => {
        if (!userId) return
        setLoading(true)
        setError(null)
        try {
            const supabase = createClient()
            // Fetch team sessions where this user participated
            const { data, error: err } = await supabase
                .from('team_sessions')
                .select('id, created_at, updated_at, host_uid, participants, workout_state, status')
                .filter('participants', 'cs', JSON.stringify([{ uid: userId }]))
                .order('created_at', { ascending: false })
                .limit(limit)
            if (err) throw err

            const rows = Array.isArray(data) ? data : []
            const parsed: TeamSessionRecord[] = rows.map(row => {
                const ws = row.workout_state && typeof row.workout_state === 'object' ? row.workout_state as Record<string, unknown> : {}
                const wd = ws.workout_data && typeof ws.workout_data === 'object' ? ws.workout_data as Record<string, unknown> : {}
                const workoutName = String(wd.title || wd.name || 'Treino em equipe')

                const parts = Array.isArray(row.participants) ? row.participants as Array<Record<string, unknown>> : []
                const myPart = parts.find(p => String(p.uid || '') === userId)
                const myVolume = Number(myPart?.volume ?? 0)

                const participantList = parts.map(p => ({
                    displayName: String(p.name || p.display_name || 'Parceiro'),
                    photoURL: p.photo ? String(p.photo) : null,
                    volume: Number(p.volume ?? 0),
                }))

                // Estimate duration from created_at to updated_at
                const start = new Date(row.created_at).getTime()
                const end = new Date(row.updated_at || row.created_at).getTime()
                const durationMinutes = Math.round(Math.max(0, (end - start) / 60000))

                return {
                    id: String(row.id),
                    createdAt: String(row.created_at),
                    workoutName,
                    durationMinutes,
                    participantCount: parts.length,
                    myVolume,
                    participants: participantList,
                    isHost: String(row.host_uid) === userId,
                }
            })
            setSessions(parsed)
        } catch (e: unknown) {
            setError('Erro ao carregar histórico de sessões em equipe.')
            logError('TeamSessionHistory', e)
        } finally {
            setLoading(false)
        }
    }, [userId, limit])

    useEffect(() => { fetchSessions() }, [fetchSessions])

    if (loading) {
        return (
            <div className="py-8 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }
    if (error) {
        return <p className="text-sm text-red-400 text-center py-4">{error}</p>
    }
    if (sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-neutral-600">
                <Users size={32} />
                <p className="text-sm text-center">Nenhuma sessão em equipe encontrada.<br />Convide um amigo e treinem juntos!</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {sessions.map(s => (
                <button
                    key={s.id}
                    onClick={() => onSelectSession?.(s)}
                    className="w-full text-left rounded-2xl border border-neutral-800 bg-neutral-800/40 hover:border-yellow-500/30 hover:bg-neutral-800/60 transition-all p-4 group"
                >
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            {/* Session badge */}
                            <div className="flex items-center gap-1.5 mb-1">
                                <div className="w-4 h-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
                                    <Users size={9} className="text-yellow-400" />
                                </div>
                                <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-wide">
                                    {s.isHost ? 'Host' : 'Participante'}
                                </span>
                                <span className="text-[10px] text-neutral-600">· {s.participantCount} pessoa{s.participantCount !== 1 ? 's' : ''}</span>
                            </div>
                            {/* Workout name */}
                            <p className="text-sm font-bold text-white truncate">{s.workoutName}</p>
                            {/* Date & duration */}
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-[11px] text-neutral-500">{fmtDate(s.createdAt)}</span>
                                {s.durationMinutes > 0 && (
                                    <span className="flex items-center gap-0.5 text-[11px] text-neutral-500">
                                        <Clock size={9} />{s.durationMinutes}min
                                    </span>
                                )}
                                {s.myVolume > 0 && (
                                    <span className="flex items-center gap-0.5 text-[11px] text-neutral-400">
                                        <TrendingUp size={9} />{fmtVol(s.myVolume)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {/* Participant avatar stack */}
                            <div className="flex -space-x-1.5">
                                {s.participants.slice(0, 4).map((p, i) => (
                                    <div key={i} className="w-6 h-6 rounded-full border-2 border-neutral-900 overflow-hidden bg-neutral-700 shrink-0">
                                        {p.photoURL ? (
                                            <Image src={p.photoURL} alt={p.displayName} width={24} height={24} className="object-cover" unoptimized />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[9px] font-black text-neutral-300">
                                                {p.displayName[0]?.toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {s.participants.length > 4 && (
                                    <div className="w-6 h-6 rounded-full border-2 border-neutral-900 bg-neutral-700 flex items-center justify-center text-[8px] text-neutral-300 font-bold">
                                        +{s.participants.length - 4}
                                    </div>
                                )}
                            </div>
                            <ChevronRight size={14} className="text-neutral-600 group-hover:text-neutral-400 transition-colors" />
                        </div>
                    </div>
                </button>
            ))}
        </div>
    )
}

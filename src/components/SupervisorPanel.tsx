'use client'
import React, { useState } from 'react'
import { Eye, Send, MessageSquare, Users, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react'
import Image from 'next/image'
import type { SharedLogsMap } from '@/contexts/TeamWorkoutContext'

interface SupervisorParticipant {
    userId: string
    displayName: string
    photoURL: string | null
    presenceStatus?: 'online' | 'away' | 'offline'
}

interface SupervisorPanelProps {
    participants: SupervisorParticipant[]
    sharedLogs: SharedLogsMap
    exercises: Array<{ name?: string }>
    onSendCoaching: (message: string) => void
    isVisible?: boolean
    onClose?: () => void
}

function calcVolume(logs: Record<string, { weight?: string | number; reps?: string | number }> | Record<string, { exIdx: number; sIdx: number; weight: string; reps: string; ts: number }>) {
    let vol = 0
    for (const v of Object.values(logs)) {
        const w = Number((v as Record<string, unknown>)?.weight ?? 0)
        const r = Number((v as Record<string, unknown>)?.reps ?? 0)
        if (w > 0 && r > 0) vol += w * r
    }
    return vol
}
function fmtVol(v: number) { return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)) }

const COACHING_PRESETS = [
    '💪 Ótimo ritmo! Continue assim!',
    '🔥 Aumenta o peso na próxima série!',
    '⚠️ Cuide da postura!',
    '🛑 Descanse mais entre as séries.',
    '⚡ Foque! Você consegue!',
    '🎯 Meta: superar o último recorde hoje!',
]

/**
 * SupervisorPanel — read-only monitoring dashboard for a Personal Trainer.
 * Shows all participants' live logs (via sharedLogs), volume per student,
 * presence status, and allows the supervisor to send coaching broadcast messages.
 * Role: supervisor joins the team session with `role: 'supervisor'` flag.
 */
export function SupervisorPanel({ participants, sharedLogs, exercises, onSendCoaching, isVisible = true, onClose }: SupervisorPanelProps) {
    const [collapsed, setCollapsed] = useState(false)
    const [customMsg, setCustomMsg] = useState('')
    const [sent, setSent] = useState(false)

    const handleSend = (msg: string) => {
        const text = msg.trim()
        if (!text) return
        onSendCoaching(text)
        setCustomMsg('')
        setSent(true)
        setTimeout(() => setSent(false), 2000)
    }

    if (!isVisible) return null

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[65] max-h-[60vh] flex flex-col bg-neutral-900/98 border-t border-indigo-500/30 shadow-2xl backdrop-blur-md">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center">
                        <Eye size={12} className="text-indigo-400" />
                    </div>
                    <span className="text-sm font-black text-indigo-400">Painel do Supervisor</span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-bold ml-1">
                        {participants.length} aluno{participants.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setCollapsed(c => !c)} className="text-neutral-500 hover:text-white p-1 transition-colors">
                        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {onClose && (
                        <button onClick={onClose} className="text-neutral-500 hover:text-white text-xs font-bold transition-colors">
                            Sair
                        </button>
                    )}
                </div>
            </div>

            {!collapsed && (
                <div className="flex flex-col overflow-hidden flex-1">
                    {/* Students live status */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {participants.map(p => {
                            const logs = sharedLogs[p.userId] ?? {}
                            const volume = calcVolume(logs as Record<string, { exIdx: number; sIdx: number; weight: string; reps: string; ts: number }>)
                            const setsLogged = Object.keys(logs).length
                            const lastLog = Object.values(logs).sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))[0] ?? null
                            const lastExName = lastLog ? String(exercises[lastLog.exIdx]?.name || `Exer. ${lastLog.exIdx + 1}`) : null

                            const presence = p.presenceStatus ?? 'online'
                            const presenceColor = presence === 'online' ? 'bg-green-400' : presence === 'away' ? 'bg-yellow-400' : 'bg-neutral-600'

                            return (
                                <div key={p.userId} className="rounded-2xl border border-neutral-800 bg-neutral-800/40 p-3">
                                    <div className="flex items-center gap-3">
                                        {/* Avatar + presence */}
                                        <div className="relative shrink-0">
                                            <div className="w-9 h-9 rounded-full overflow-hidden border border-neutral-700">
                                                {p.photoURL ? (
                                                    <Image src={p.photoURL} alt={p.displayName} width={36} height={36} className="object-cover" unoptimized />
                                                ) : (
                                                    <div className="w-full h-full bg-indigo-500/20 flex items-center justify-center text-xs font-black text-indigo-300">
                                                        {p.displayName[0]?.toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-neutral-900 ${presenceColor}`} />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">{p.displayName}</p>
                                            {lastExName && (
                                                <p className="text-[10px] text-neutral-500 truncate">
                                                    📍 {lastExName}
                                                    {lastLog && lastLog.weight ? ` · ${lastLog.weight}kg × ${lastLog.reps}r` : ''}
                                                </p>
                                            )}
                                        </div>

                                        {/* Stats */}
                                        <div className="text-right shrink-0">
                                            <div className="flex items-center gap-1 justify-end">
                                                <TrendingUp size={10} className="text-indigo-400" />
                                                <span className="text-xs font-black text-white">{fmtVol(volume)}</span>
                                            </div>
                                            <p className="text-[9px] text-neutral-600">{setsLogged} série{setsLogged !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}

                        {participants.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-6 gap-2 text-neutral-600">
                                <Users size={24} />
                                <p className="text-xs">Aguardando alunos entrarem na sessão…</p>
                            </div>
                        )}
                    </div>

                    {/* Coaching message area */}
                    <div className="border-t border-neutral-800 p-3 shrink-0 space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                            <MessageSquare size={11} className="text-indigo-400" />
                            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wide">Mensagem de coaching</span>
                        </div>

                        {/* Quick presets */}
                        <div className="flex flex-wrap gap-1">
                            {COACHING_PRESETS.slice(0, 4).map(msg => (
                                <button
                                    key={msg}
                                    onClick={() => handleSend(msg)}
                                    className="text-[10px] bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg px-2 py-1 text-neutral-300 transition-colors active:scale-95"
                                >
                                    {msg}
                                </button>
                            ))}
                        </div>

                        {/* Custom input */}
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={customMsg}
                                onChange={e => setCustomMsg(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSend(customMsg)}
                                placeholder="Mensagem personalizada…"
                                maxLength={200}
                                className="flex-1 bg-neutral-800 text-white text-xs rounded-xl px-3 py-2 outline-none border border-neutral-700 focus:border-indigo-500/40 placeholder:text-neutral-600 transition-colors"
                            />
                            <button
                                onClick={() => handleSend(customMsg)}
                                disabled={!customMsg.trim() || sent}
                                className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center disabled:opacity-30 hover:bg-indigo-400 transition-colors active:scale-95"
                            >
                                {sent ? '✓' : <Send size={13} />}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

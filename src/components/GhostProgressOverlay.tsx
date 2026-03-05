'use client'
import React, { useMemo, useState } from 'react'
import { Ghost, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import Image from 'next/image'
import type { GhostPartnerData, GhostLogEntry } from '@/hooks/useGhostPartner'

interface GhostProgressOverlayProps {
    ghost: GhostPartnerData
    /** Current user's live logs keyed by "exIdx-sIdx" */
    myLogs: Record<string, { weight?: string | number; reps?: string | number }>
    /** Exercise names by index */
    exercises: Array<{ name?: string }>
}

function parseNum(v: unknown) {
    const n = Number(String(v ?? '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
}

function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }
    catch { return iso }
}

type DeltaDir = 'up' | 'down' | 'same'

interface GhostSetRow {
    key: string
    exName: string
    setLabel: string
    ghost: GhostLogEntry
    myWeight: number
    myReps: number
    delta: number   // volume diff (my - ghost)
    dir: DeltaDir
}

/**
 * GhostProgressOverlay — shows side-by-side comparison of current user's sets vs
 * a partner's past performance (ghost data). Collapses to a pill when not in focus.
 */
export function GhostProgressOverlay({ ghost, myLogs, exercises }: GhostProgressOverlayProps) {
    const [collapsed, setCollapsed] = useState(false)

    const rows: GhostSetRow[] = useMemo(() => {
        return ghost.logs.map(gl => {
            const key = `${gl.exIdx}-${gl.sIdx}`
            const myRaw = myLogs[key]
            const myWeight = typeof myRaw !== 'undefined' ? parseNum(myRaw?.weight) : 0
            const myReps = typeof myRaw !== 'undefined' ? parseNum(myRaw?.reps) : 0
            const ghostVol = gl.weight * gl.reps
            const myVol = myWeight * myReps
            const delta = myVol - ghostVol
            const dir: DeltaDir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'
            const exName = String(exercises[gl.exIdx]?.name || gl.exName || `Exer. ${gl.exIdx + 1}`)
            return { key, exName, setLabel: `Série ${gl.sIdx + 1}`, ghost: gl, myWeight, myReps, delta, dir }
        })
    }, [ghost.logs, myLogs, exercises])

    const beatingCount = rows.filter(r => r.dir === 'up').length
    const totalGhost = rows.length

    if (rows.length === 0) return null

    return (
        <div className="fixed top-36 right-4 z-[54] w-60 rounded-2xl border border-purple-500/30 bg-neutral-900/95 backdrop-blur-md shadow-xl shadow-purple-900/10 overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setCollapsed(c => !c)}
                className="w-full flex items-center justify-between px-3 py-2 border-b border-neutral-800"
            >
                <div className="flex items-center gap-1.5">
                    <Ghost size={12} className="text-purple-400" />
                    <span className="text-[11px] font-black text-purple-400 uppercase tracking-wide">Ghost Mode</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {!collapsed && (
                        <span className="text-[9px] text-neutral-500">{beatingCount}/{totalGhost} superados</span>
                    )}
                    {collapsed
                        ? <ChevronDown size={11} className="text-neutral-500" />
                        : <ChevronUp size={11} className="text-neutral-500" />
                    }
                </div>
            </button>

            {!collapsed && (
                <div className="p-2">
                    {/* Partner info */}
                    <div className="flex items-center gap-2 mb-2 px-1">
                        <div className="w-5 h-5 rounded-full overflow-hidden border border-purple-500/30 shrink-0">
                            {ghost.photoURL ? (
                                <Image src={ghost.photoURL} alt={ghost.partnerName} width={20} height={20} className="object-cover" unoptimized />
                            ) : (
                                <div className="w-full h-full bg-purple-500/20 flex items-center justify-center text-[8px] font-black text-purple-300">
                                    {ghost.partnerName[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-purple-300 truncate">{ghost.partnerName}</p>
                            <p className="text-[9px] text-neutral-600">{fmtDate(ghost.sessionDate)}</p>
                        </div>
                    </div>

                    {/* Set comparison rows */}
                    <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
                        {rows.map(row => (
                            <div key={row.key} className={`rounded-xl px-2 py-1.5 ${row.dir === 'up' ? 'bg-green-500/10 border border-green-500/20'
                                    : row.dir === 'down' ? 'bg-red-500/8 border border-red-500/15'
                                        : 'bg-neutral-800/40 border border-neutral-700/30'
                                }`}>
                                <div className="flex items-center justify-between gap-1">
                                    <p className="text-[9px] text-neutral-500 truncate flex-1">
                                        {row.exName} · {row.setLabel}
                                    </p>
                                    {row.dir === 'up' && <TrendingUp size={9} className="text-green-400 shrink-0" />}
                                    {row.dir === 'down' && <TrendingDown size={9} className="text-red-400 shrink-0" />}
                                    {row.dir === 'same' && <Minus size={9} className="text-neutral-500 shrink-0" />}
                                </div>
                                <div className="flex justify-between mt-0.5">
                                    {/* My set */}
                                    <div className="text-center">
                                        <p className={`text-[11px] font-black ${row.dir === 'up' ? 'text-green-300' : row.dir === 'down' ? 'text-red-300' : 'text-white'}`}>
                                            {row.myWeight > 0 ? `${row.myWeight}kg` : '-'}
                                        </p>
                                        <p className="text-[8px] text-neutral-600">{row.myReps > 0 ? `${row.myReps}r` : '-'} meu</p>
                                    </div>
                                    {/* Divider */}
                                    <div className="text-[9px] text-neutral-600 self-center">vs</div>
                                    {/* Ghost */}
                                    <div className="text-center">
                                        <p className="text-[11px] font-black text-purple-300">
                                            {row.ghost.weight > 0 ? `${row.ghost.weight}kg` : '-'}
                                        </p>
                                        <p className="text-[8px] text-neutral-600">{row.ghost.reps > 0 ? `${row.ghost.reps}r` : '-'} ghost</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

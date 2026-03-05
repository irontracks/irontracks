'use client'
import React from 'react'
import { normalizeExerciseKey } from '@/utils/report/formatters'

type AnyObj = Record<string, unknown>

interface ReportExerciseCardProps {
    exercise: AnyObj
    exIdx: number
    sessionLogs: Record<string, unknown>
    prevLogs: unknown[]
    baseMs: unknown
}

// ─── Epley 1RM estimate ───────────────────────────────────────────────────────
// Formula: e1RM = weight × (1 + reps / 30)
// Returns null when weight or reps are invalid/zero
function epley1RM(weight: number, reps: number): number | null {
    if (!Number.isFinite(weight) || weight <= 0) return null
    if (!Number.isFinite(reps) || reps <= 0) return null
    // For 1 rep, the 1RM equals the weight itself
    if (reps === 1) return weight
    return weight * (1 + reps / 30)
}

// Parse weight/reps safely from a log object
function parseWR(logObj: AnyObj): { w: number; r: number } {
    const w = Number(String(logObj?.weight ?? '').replace(',', '.'))
    const r = Number(String(logObj?.reps ?? '').replace(',', '.'))
    return {
        w: Number.isFinite(w) && w > 0 ? w : 0,
        r: Number.isFinite(r) && r > 0 ? r : 0,
    }
}

// ─── Progression logic ────────────────────────────────────────────────────────
// Priority: 1) e1RM delta (most meaningful), 2) volume per set (w×r), 3) reps alone
type ProgressionResult = {
    text: string
    rowClass: string
    isPr: boolean
    e1rmText: string | null
}

function computeProgression(logObj: AnyObj, prevObj: AnyObj | null): ProgressionResult {
    const no: ProgressionResult = { text: '—', rowClass: '', isPr: false, e1rmText: null }
    const { w: cw, r: cr } = parseWR(logObj)
    const curVolume = cw > 0 && cr > 0 ? cw * cr : 0
    const curE1rm = epley1RM(cw, cr)

    // Build 1RM display text
    const e1rmText = curE1rm != null ? `${curE1rm.toFixed(1)} kg` : null

    if (!prevObj) return { ...no, e1rmText }

    const { w: pw, r: pr } = parseWR(prevObj)
    const prevVolume = pw > 0 && pr > 0 ? pw * pr : 0
    const prevE1rm = epley1RM(pw, pr)

    const hasCurrentData = cw > 0 || cr > 0
    const hasPrevData = pw > 0 || pr > 0
    if (!hasCurrentData || !hasPrevData) return { ...no, e1rmText }

    // 1️⃣ Primary: compare e1RM (most sport-science-accurate metric)
    if (curE1rm != null && prevE1rm != null) {
        const delta1rm = curE1rm - prevE1rm
        const deltaPct = prevE1rm > 0 ? (delta1rm / prevE1rm) * 100 : 0
        if (Math.abs(delta1rm) >= 0.1) {
            if (delta1rm > 0) {
                const isPr = delta1rm > 0
                return {
                    text: `+${delta1rm.toFixed(1)} kg 1RM (${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`,
                    rowClass: 'bg-green-500/15 text-green-200 font-bold',
                    isPr,
                    e1rmText,
                }
            } else {
                return {
                    text: `${delta1rm.toFixed(1)} kg 1RM (${deltaPct.toFixed(1)}%)`,
                    rowClass: 'text-red-300 font-bold',
                    isPr: false,
                    e1rmText,
                }
            }
        }
    }

    // 2️⃣ Secondary: compare volume per set (weight × reps)
    if (curVolume > 0 && prevVolume > 0 && curVolume !== prevVolume) {
        const deltaVol = curVolume - prevVolume
        if (deltaVol > 0) {
            return {
                text: `+${deltaVol.toFixed(0)} kg vol`,
                rowClass: 'bg-green-500/15 text-green-200 font-bold',
                isPr: false,
                e1rmText,
            }
        } else {
            return {
                text: `${deltaVol.toFixed(0)} kg vol`,
                rowClass: 'text-red-300 font-bold',
                isPr: false,
                e1rmText,
            }
        }
    }

    // 3️⃣ Tertiary: compare reps alone (same weight)
    if (cr > 0 && pr > 0 && cr !== pr) {
        const dr = cr - pr
        if (dr > 0) {
            return {
                text: `+${dr} reps`,
                rowClass: 'bg-green-500/15 text-green-200 font-bold',
                isPr: false,
                e1rmText,
            }
        } else {
            return {
                text: `${dr} reps`,
                rowClass: 'text-red-300 font-bold',
                isPr: false,
                e1rmText,
            }
        }
    }

    // No change
    return { text: '=', rowClass: 'text-neutral-500', isPr: false, e1rmText }
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ReportExerciseCard = ({ exercise, exIdx, sessionLogs, prevLogs, baseMs }: ReportExerciseCardProps) => {
    const obj = exercise
    const exName = String(obj?.name || '').trim()
    const baseText = (() => {
        try {
            if (!Number.isFinite(Number(baseMs))) return ''
            const d = new Date(Number(baseMs))
            if (Number.isNaN(d.getTime())) return ''
            return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
        } catch {
            return ''
        }
    })()

    const setsCount = Number(obj?.sets ?? 0) || 0

    // Calculate best e1RM for this exercise across all sets (for PR badge)
    const bestE1rm = (() => {
        let best = 0
        for (let sIdx = 0; sIdx < setsCount; sIdx++) {
            const key = `${exIdx}-${sIdx}`
            const log = sessionLogs[key]
            if (!log || typeof log !== 'object') continue
            const { w, r } = parseWR(log as AnyObj)
            const e1rm = epley1RM(w, r)
            if (e1rm != null && e1rm > best) best = e1rm
        }
        return best > 0 ? best : null
    })()

    // Count PRs in this exercise
    const prCount = (() => {
        let n = 0
        for (let sIdx = 0; sIdx < setsCount; sIdx++) {
            const key = `${exIdx}-${sIdx}`
            const log = sessionLogs[key]
            if (!log || typeof log !== 'object') continue
            const prevLog = Array.isArray(prevLogs) && prevLogs[sIdx] ? prevLogs[sIdx] as AnyObj : null
            const { isPr } = computeProgression(log as AnyObj, prevLog)
            if (isPr) n++
        }
        return n
    })()

    return (
        <div className="break-inside-avoid">
            <div className="flex justify-between items-end mb-2 border-b-2 border-neutral-800 pb-2">
                <h3 className="text-xl font-bold uppercase flex items-center gap-2">
                    <span className="bg-black text-white w-6 h-6 flex items-center justify-center rounded text-xs">{exIdx + 1}</span>
                    {exName || '—'}
                    {prCount > 0 && (
                        <span className="text-xs font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 px-1.5 py-0.5 rounded-lg tracking-wide">
                            🏆 {prCount > 1 ? `${prCount} PRs` : 'PR'}
                        </span>
                    )}
                </h3>
                <div className="flex gap-3 text-xs font-mono text-neutral-400">
                    {baseText && <span>Base: <span className="font-bold text-neutral-100">{baseText}</span></span>}
                    {bestE1rm != null && (
                        <span>1RM est: <span className="font-bold text-blue-300">{bestE1rm.toFixed(1)} kg</span></span>
                    )}
                    {(() => {
                        const m = String((obj?.method ?? '') as string).trim()
                        return m && m !== 'Normal' ? <span className="text-red-300 font-bold uppercase">{m}</span> : null
                    })()}
                    {(() => {
                        const r = obj?.rpe as unknown
                        return r != null && String(r).trim() ? <span>RPE: <span className="font-bold text-neutral-100">{String(r)}</span></span> : null
                    })()}
                    <span>Cad: <span className="font-bold text-neutral-100">{String((obj?.cadence ?? '-') as string)}</span></span>
                </div>
            </div>
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-neutral-400 border-b border-neutral-800">
                        <th className="py-2 text-left w-16 font-black">Série</th>
                        <th className="py-2 text-center w-20 font-black">Carga</th>
                        <th className="py-2 text-center w-16 font-black">Reps</th>
                        <th className="py-2 text-center w-24 font-black">1RM est.</th>
                        <th className="py-2 text-center font-black">Evolução</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: setsCount }).map((_, sIdx) => {
                        const key = `${exIdx}-${sIdx}`
                        const log = sessionLogs[key]
                        const prevLog = Array.isArray(prevLogs) && prevLogs[sIdx] ? prevLogs[sIdx] as AnyObj : null

                        if (!log || typeof log !== 'object') return null
                        const logObj = log as AnyObj
                        if (!logObj.weight && !logObj.reps) return null

                        const { text: progressionText, rowClass, isPr, e1rmText } = computeProgression(logObj, prevLog)

                        return (
                            <React.Fragment key={`${exIdx}-${sIdx}`}>
                                <tr className={`border-b border-neutral-800 ${isPr ? 'bg-yellow-500/5' : ''}`}>
                                    <td className="py-2 font-mono text-neutral-400 text-xs">
                                        #{sIdx + 1}
                                        {isPr && <span className="ml-1 text-yellow-400">★</span>}
                                    </td>
                                    <td className="py-2 text-center font-semibold text-sm">
                                        {logObj.weight != null && String(logObj.weight) !== '' ? `${String(logObj.weight)} kg` : '—'}
                                    </td>
                                    <td className="py-2 text-center font-mono text-sm">
                                        {logObj.reps != null && String(logObj.reps) !== '' ? String(logObj.reps) : '—'}
                                    </td>
                                    <td className="py-2 text-center text-[11px] font-mono text-blue-300">
                                        {e1rmText ?? '—'}
                                    </td>
                                    <td className={`py-2 text-center text-[11px] ${rowClass}`}>
                                        {progressionText}
                                    </td>
                                </tr>
                                {(() => {
                                    const noteRaw = logObj?.notes ?? logObj?.note ?? logObj?.observation ?? null
                                    const note = noteRaw != null ? String(noteRaw).trim() : ''
                                    if (!note) return null
                                    return (
                                        <tr key={`${sIdx}-note`} className="border-b border-neutral-800">
                                            <td className="pb-3 pt-1 text-[10px] uppercase tracking-widest text-neutral-500 font-black">Obs</td>
                                            <td className="pb-3 pt-1 text-xs text-neutral-200" colSpan={4}>
                                                {note}
                                            </td>
                                        </tr>
                                    )
                                })()}
                            </React.Fragment>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

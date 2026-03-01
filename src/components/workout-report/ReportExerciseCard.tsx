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

    return (
        <div className="break-inside-avoid">
            <div className="flex justify-between items-end mb-2 border-b-2 border-neutral-800 pb-2">
                <h3 className="text-xl font-bold uppercase flex items-center gap-2">
                    <span className="bg-black text-white w-6 h-6 flex items-center justify-center rounded text-xs">{exIdx + 1}</span>
                    {exName || '—'}
                </h3>
                <div className="flex gap-3 text-xs font-mono text-neutral-400">
                    {baseText && <span>Base: <span className="font-bold text-neutral-100">{baseText}</span></span>}
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
                        <th className="py-2 text-center w-24 font-black">Carga</th>
                        <th className="py-2 text-center w-24 font-black">Reps</th>
                        <th className="py-2 text-center w-32 font-black">Evolução</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: setsCount }).map((_, sIdx) => {
                        const key = `${exIdx}-${sIdx}`
                        const log = sessionLogs[key]
                        const prevLog = Array.isArray(prevLogs) && prevLogs[sIdx] ? prevLogs[sIdx] : null

                        if (!log || typeof log !== 'object') return null
                        const logObj = log as AnyObj
                        if (!logObj.weight && !logObj.reps) return null

                        let progressionText = "-"
                        let rowClass = ""

                        if (prevLog && typeof prevLog === 'object') {
                            const prevObj = prevLog as AnyObj
                            const cw = Number(String(logObj?.weight ?? '').replace(',', '.'))
                            const pw = Number(String(prevObj?.weight ?? '').replace(',', '.'))
                            const cr = Number(String(logObj?.reps ?? '').replace(',', '.'))
                            const pr = Number(String(prevObj?.reps ?? '').replace(',', '.'))
                            const canWeight = Number.isFinite(cw) && cw > 0 && Number.isFinite(pw) && pw > 0
                            const canReps = Number.isFinite(cr) && cr > 0 && Number.isFinite(pr) && pr > 0
                            if (canWeight) {
                                const delta = cw - pw
                                if (delta > 0) {
                                    progressionText = `+${String(delta).replace(/\.0+$/, '')}kg`
                                    rowClass = "bg-green-500/15 text-green-200 font-bold"
                                } else if (delta < 0) {
                                    progressionText = `${String(delta).replace(/\.0+$/, '')}kg`
                                    rowClass = "text-red-300 font-bold"
                                } else {
                                    progressionText = "="
                                }
                            } else if (canReps) {
                                const delta = cr - pr
                                if (delta > 0) {
                                    progressionText = `+${delta} reps`
                                    rowClass = "bg-green-500/15 text-green-200 font-bold"
                                } else if (delta < 0) {
                                    progressionText = `${delta} reps`
                                    rowClass = "text-red-300 font-bold"
                                } else {
                                    progressionText = "="
                                }
                            }
                        }

                        return (
                            <React.Fragment key={`${exIdx}-${sIdx}`}>
                                <tr className="border-b border-neutral-800">
                                    <td className="py-2 font-mono text-neutral-400 text-xs">#{sIdx + 1}</td>
                                    <td className="py-2 text-center font-semibold text-sm">{logObj.weight != null && String(logObj.weight) !== '' ? String(logObj.weight) : '-'}</td>
                                    <td className="py-2 text-center font-mono text-sm">{logObj.reps != null && String(logObj.reps) !== '' ? String(logObj.reps) : '-'}</td>
                                    <td className={`py-2 text-center text-[11px] uppercase ${rowClass}`}>{progressionText}</td>
                                </tr>
                                {(() => {
                                    const noteRaw = logObj?.notes ?? logObj?.note ?? logObj?.observation ?? null
                                    const note = noteRaw != null ? String(noteRaw).trim() : ''
                                    if (!note) return null
                                    return (
                                        <tr key={`${sIdx}-note`} className="border-b border-neutral-800">
                                            <td className="pb-3 pt-1 text-[10px] uppercase tracking-widest text-neutral-500 font-black">Obs</td>
                                            <td className="pb-3 pt-1 text-xs text-neutral-200" colSpan={3}>
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

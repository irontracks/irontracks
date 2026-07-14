'use client'
import React from 'react'
import { setTopWeightReps, setBestE1rm, setVolume } from '@/utils/report/setVolume'
import { resolveReportSetsCount } from '@/utils/report/resolveSetsCount'
import { formatSetStages } from '@/utils/report/formatStages'

type AnyObj = Record<string, unknown>

interface ReportExerciseCardProps {
    exercise: AnyObj
    exIdx: number
    sessionLogs: Record<string, unknown>
    prevLogs: unknown[]
    baseMs: unknown
}

// O Epley LOCAL foi removido: ele era aplicado ao topo do log e, no drop-set, o
// topo guarda a etapa MAIS LEVE × TOTAL de reps → 1RM inflado/sem sentido
// (57→36kg virava Epley(36,30)=72kg). Agora usamos setBestE1rm (fonte única em
// setVolume.ts), que pega a MELHOR etapa do drop, o melhor bloco do cluster, etc.

// Parse weight/reps safely from a log object.
// setTopWeightReps pega o lado (L/R) dos exercícios unilaterais — antes lia só
// weight/reps do topo e zerava 1RM/PR/"Melhor série" nesses exercícios.
function parseWR(logObj: AnyObj): { w: number; r: number } {
    const { weight, reps } = setTopWeightReps(logObj)
    return { w: weight, r: reps }
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
    // FONTE ÚNICA (setBestE1rm/setVolume): trata drop-set, cluster, wave e unilateral.
    // Antes usava Epley(topo do log) — no drop, o topo guarda a etapa MAIS LEVE ×
    // TOTAL de reps, então "57kg→36kg (12+18)" virava Epley(36,30)=72kg, um número
    // sem sentido físico que ainda gerava uma "evolução" negativa falsa.
    const curVolume = setVolume(logObj)
    const curE1rm = setBestE1rm(logObj) || null

    // Build 1RM display text
    const e1rmText = curE1rm != null ? `${curE1rm.toFixed(1)} kg` : null

    if (!prevObj) return { ...no, e1rmText }

    const { w: pw, r: pr } = parseWR(prevObj)
    const prevVolume = setVolume(prevObj)
    const prevE1rm = setBestE1rm(prevObj) || null

    const hasCurrentData = cw > 0 || cr > 0
    const hasPrevData = pw > 0 || pr > 0
    if (!hasCurrentData || !hasPrevData) return { ...no, e1rmText }

    // 1️⃣ Primary: compare e1RM (most sport-science-accurate metric)
    if (curE1rm != null && prevE1rm != null) {
        const delta1rm = curE1rm - prevE1rm
        const deltaPct = prevE1rm > 0 ? (delta1rm / prevE1rm) * 100 : 0
        if (Math.abs(delta1rm) >= 0.1) {
            if (delta1rm > 0) {
                // Base fraca/primeiro registro pesado faz o 1RM "dobrar" e gera
                // "+280kg 1RM (+100%)" — números sem sentido físico. Nesses saltos
                // (>=2×) mostramos "novo patamar" em vez de inflar a métrica.
                const bigJump = prevE1rm > 0 && curE1rm != null && curE1rm >= prevE1rm * 2
                return {
                    text: bigJump
                        ? '↑ novo patamar'
                        : `+${delta1rm.toFixed(1)} kg 1RM (${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`,
                    rowClass: 'bg-green-500/15 text-green-200 font-bold',
                    isPr: true,
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
            const bms = Number(baseMs)
            // Guard against null (Number(null)=0) and epoch 0 (1970-01-01)
            if (!bms || bms <= 0 || !Number.isFinite(bms)) return ''
            const d = new Date(bms)
            if (Number.isNaN(d.getTime())) return ''
            return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
        } catch {
            return ''
        }
    })()

    // Conta robusta (sets ausente em unilateral/legado zerava a tabela). Ver helper.
    const setsCount = resolveReportSetsCount(obj, exIdx, sessionLogs)

    // Calculate best e1RM for this exercise across all sets (for PR badge).
    // setBestE1rm = fonte única (melhor ETAPA no drop, melhor bloco no cluster, etc).
    const bestE1rm = (() => {
        let best = 0
        for (let sIdx = 0; sIdx < setsCount; sIdx++) {
            const key = `${exIdx}-${sIdx}`
            const log = sessionLogs[key]
            if (!log || typeof log !== 'object') continue
            const e1rm = setBestE1rm(log)
            if (e1rm > best) best = e1rm
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

    // Index of best set (highest e1RM) — marked with 💎
    const bestSetIdx = (() => {
        let bestIdx = -1
        let bestVal = 0
        for (let sIdx = 0; sIdx < setsCount; sIdx++) {
            const key = `${exIdx}-${sIdx}`
            const log = sessionLogs[key]
            if (!log || typeof log !== 'object') continue
            const e1rm = setBestE1rm(log)
            if (e1rm > bestVal) { bestVal = e1rm; bestIdx = sIdx }
        }
        return bestIdx
    })()

    return (
        <div className="break-inside-avoid">
            {/* Título em linha própria (quebra em vez de truncar — antes "Cadeira
                Abdutora" e "Cadeira Adutora" viravam ambas "CAD..."). Metadados
                abaixo em flex-wrap (o "Cad:" não corta mais na borda). */}
            <div className="mb-2 border-b-2 border-neutral-800 pb-2">
                <h3 className="text-lg sm:text-xl font-bold uppercase flex items-start gap-2 flex-wrap leading-tight">
                    <span className="bg-black text-white w-6 h-6 flex items-center justify-center rounded text-xs shrink-0">{exIdx + 1}</span>
                    <span className="break-words min-w-0">{exName || '—'}</span>
                    {prCount > 0 && (
                        <span className="text-xs font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 px-1.5 py-0.5 rounded-lg tracking-wide shrink-0">
                            🏆 {prCount > 1 ? `${prCount} PRs` : 'PR'}
                        </span>
                    )}
                </h3>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-neutral-400">
                    {baseText && <span>Base: <span className="font-bold text-neutral-100">{baseText}</span></span>}
                    {bestE1rm != null && (
                        <span>1RM est: <span className="font-bold text-amber-300">{bestE1rm.toFixed(1)} kg</span></span>
                    )}
                    {(() => {
                        const m = String((obj?.method ?? '') as string).trim()
                        return m && m !== 'Normal' ? <span className="text-red-300 font-bold uppercase">{m}</span> : null
                    })()}
                    {(() => {
                        const r = obj?.rpe as unknown
                        return r != null && String(r).trim() ? <span>RPE: <span className="font-bold text-neutral-100">{String(r)}</span></span> : null
                    })()}
                    {(() => {
                        const c = String((obj?.cadence ?? '') as string).trim()
                        return c ? <span>Cad: <span className="font-bold text-neutral-100">{c}</span></span> : null
                    })()}
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
                        // dispW/dispR já resolvem unilateral (L/R) — sem isso a linha
                        // sumia porque weight/reps do topo vêm vazios nesses exercícios.
                        const { w: dispW, r: dispR } = parseWR(logObj)
                        if (dispW <= 0 && dispR <= 0) return null
                        // Etapas do drop-set/stripping (null em série normal)
                        const stages = formatSetStages(logObj)

                        const { text: progressionText, rowClass, isPr, e1rmText } = computeProgression(logObj, prevLog)

                        return (
                            <React.Fragment key={`${exIdx}-${sIdx}`}>
                                <tr className={`border-b border-neutral-800 ${isPr ? 'bg-yellow-500/5' : ''}`}>
                                    <td className="py-2 font-mono text-neutral-400 text-xs">
                                        <div className="flex items-center gap-1">
                                            #{sIdx + 1}
                                            {isPr && <span className="text-yellow-400" title="Recorde pessoal">★</span>}
                                            {sIdx === bestSetIdx && (
                                                <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 rounded font-black" title="Melhor série (maior 1RM estimado)">Melhor</span>
                                            )}
                                        </div>
                                    </td>
                                    {/* Drop-set/stripping: mostra as ETAPAS (ex.: "57 → 36 kg" / "12 → 18").
                                        O topo do log guarda só a última etapa + a soma das reps, o que
                                        escondia o drop inteiro. */}
                                    <td className="py-2 text-center font-semibold text-sm">
                                        {stages
                                            ? <span className="whitespace-nowrap">{stages.weights} kg</span>
                                            : logObj.weight != null && String(logObj.weight) !== '' ? `${String(logObj.weight)} kg` : dispW > 0 ? `${dispW} kg` : '—'}
                                    </td>
                                    <td className="py-2 text-center font-mono text-sm">
                                        {stages
                                            ? <span className="whitespace-nowrap">{stages.reps}</span>
                                            : logObj.reps != null && String(logObj.reps) !== '' ? String(logObj.reps) : dispR > 0 ? String(dispR) : '—'}
                                    </td>
                                    <td className="py-2 text-center text-[11px] font-mono text-amber-300">
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

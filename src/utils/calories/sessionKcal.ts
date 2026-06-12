/**
 * sessionKcal.ts — kcal de uma sessão de treino a partir do JSON salvo (`notes`).
 *
 * Encapsula a extração de inputs que o relatório (`buildHtml.ts`) faz inline e
 * delega ao MESMO modelo MET multi-fator (`estimateCaloriesMet`). Assim o painel
 * de nutrição mostra exatamente o mesmo número de calorias do relatório de
 * treino, em vez de uma estimativa fixa.
 */
import { estimateCaloriesMet } from './metEstimate'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export interface SessionKcalOpts {
  bodyWeightKg?: number | null
  biologicalSex?: string | null
  rpe?: number | null
}

/**
 * Estimates calories burned for a completed strength session, given its saved
 * session object (the parsed `workouts.notes` JSON). Returns 0 when there's not
 * enough data. Body weight / sex from the user profile take precedence over the
 * session's pre-checkin values.
 */
export function estimateSessionKcal(session: unknown, opts: SessionKcalOpts = {}): number {
  const sessionObj = isRecord(session) ? session : {}
  const sessionLogs = isRecord(sessionObj.logs) ? sessionObj.logs : {}
  const totalTimeSeconds = Number(sessionObj.totalTime) || 0

  const exerciseNames = Array.isArray(sessionObj.exercises)
    ? (sessionObj.exercises as unknown[])
        .map((ex) => String((isRecord(ex) ? ex.name : '') || '').trim())
        .filter(Boolean)
    : null

  const cadenceNames = Array.isArray(sessionObj.exercises)
    ? (sessionObj.exercises as unknown[])
        .map((ex) => {
          const e = isRecord(ex) ? ex : null
          return String(e?.cadence || e?.tempo || '').trim()
        })
        .filter(Boolean)
    : null

  // Body weight: profile (opts) first, then session pre-checkin.
  const pcRaw = isRecord(sessionObj.preCheckin) ? (sessionObj.preCheckin as Record<string, unknown>) : null
  const bwCandidates: unknown[] = [
    opts.bodyWeightKg,
    pcRaw?.weight,
    pcRaw?.body_weight_kg,
    isRecord(pcRaw?.answers) ? (pcRaw!.answers as Record<string, unknown>).body_weight_kg : null,
  ]
  const bodyWeightKg = bwCandidates.reduce<number | null>((acc, c) => {
    if (acc !== null) return acc
    const n = Number(c)
    return Number.isFinite(n) && n >= 20 && n <= 300 ? n : null
  }, null)

  const sexRaw = String(opts.biologicalSex ?? sessionObj.biologicalSex ?? '').toLowerCase()
  const bioSex = sexRaw === 'male' || sexRaw === 'female' ? sexRaw : null

  const rpeNum = Number(opts.rpe)
  const rpeValue = Number.isFinite(rpeNum) && rpeNum >= 1 && rpeNum <= 10 ? rpeNum : null

  const execSec = Number(sessionObj.executionTotalSeconds ?? sessionObj.execution_total_seconds ?? 0) || 0
  const restSec = Number(sessionObj.restTotalSeconds ?? sessionObj.rest_total_seconds ?? 0) || 0

  const kcal = estimateCaloriesMet(
    sessionLogs,
    totalTimeSeconds / 60,
    bodyWeightKg,
    exerciseNames,
    rpeValue,
    execSec > 0 ? execSec / 60 : null,
    restSec > 0 ? restSec / 60 : null,
    bioSex,
    null,
    null,
    cadenceNames && cadenceNames.length > 0 ? cadenceNames : null,
  )
  return kcal > 0 ? kcal : 0
}

/**
 * sessionKcal.ts — kcal de uma sessão de treino a partir do JSON salvo (`notes`).
 *
 * Encapsula a extração de inputs que o relatório (`buildHtml.ts`) faz inline e
 * delega ao MESMO modelo MET multi-fator (`estimateCaloriesMet`). Assim o painel
 * de nutrição mostra exatamente o mesmo número de calorias do relatório de
 * treino, em vez de uma estimativa fixa.
 */
import { estimateCaloriesMet } from './metEstimate'
import { estimateCardioKcal } from './cardioKcal'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

export interface SessionKcalOpts {
  bodyWeightKg?: number | null
  biologicalSex?: string | null
  rpe?: number | null
}

export interface SessionKcalBreakdown {
  /** Total da sessão (força + cardio), arredondado. */
  total: number
  /** kcal do modelo de força (só o tempo não-cardio). */
  strengthKcal: number
  /** kcal somada de todos os cardios. */
  cardioTotalKcal: number
  /** kcal de cardio por índice de exercício (na ordem de session.exercises). */
  cardioPerExerciseKcal: Record<number, number>
}

/**
 * Como estimateSessionKcal, mas retorna as PARTES (força × cardio) — usado pelo
 * relatório pra dar a cada exercício de cardio sua kcal-MET exata e ratear só o
 * restante (força) entre os demais.
 */
export function estimateSessionKcalBreakdown(session: unknown, opts: SessionKcalOpts = {}): SessionKcalBreakdown {
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

  // Cardio pelo MET da modalidade (o modelo de força trataria como leve).
  const cardio = estimateCardioKcal(sessionObj, { bodyWeightKg, biologicalSex: bioSex })

  // Modelo de força cobre só o tempo NÃO-cardio (senão o tempo de cardio contaria
  // duas vezes: como leve aqui e como modalidade no cardio).
  const totalMin = totalTimeSeconds / 60
  const strengthMin = Math.max(0, totalMin - cardio.cardioMinutes)
  const strengthExecMin = execSec > 0 ? Math.max(0, execSec / 60 - cardio.cardioMinutes) : null

  const strengthKcal = strengthMin > 0
    ? estimateCaloriesMet(
      sessionLogs,
      strengthMin,
      bodyWeightKg,
      exerciseNames,
      rpeValue,
      strengthExecMin,
      restSec > 0 ? restSec / 60 : null,
      bioSex,
      null,
      null,
      cadenceNames && cadenceNames.length > 0 ? cadenceNames : null,
    )
    : 0

  const total = Math.max(0, strengthKcal + cardio.totalKcal)
  return {
    total,
    strengthKcal: Math.max(0, strengthKcal),
    cardioTotalKcal: cardio.totalKcal,
    cardioPerExerciseKcal: cardio.perExerciseKcal,
  }
}

/**
 * Estimates calories burned for a completed session (strength + cardio), given
 * its saved session object (the parsed `workouts.notes` JSON). Returns 0 when
 * there's not enough data. Body weight / sex from the user profile take
 * precedence over the session's pre-checkin values.
 */
export function estimateSessionKcal(session: unknown, opts: SessionKcalOpts = {}): number {
  return estimateSessionKcalBreakdown(session, opts).total
}

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
import { isCardioExercise } from '@/utils/exercise/isCardio'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Houve musculação de verdade na sessão? (log com peso ou reps num exercício que
 * NÃO é cardio). É o que distingue "sessão que é só a aula" de "sessão de
 * musculação com uma aula lançada junto".
 */
function hasNonCardioWork(session: Record<string, unknown>, logs: Record<string, unknown>): boolean {
  const exercises = Array.isArray(session.exercises) ? (session.exercises as unknown[]) : []
  return Object.entries(logs).some(([key, log]) => {
    const exIdx = Number(String(key).split('-')[0])
    if (!Number.isFinite(exIdx)) return false
    if (isCardioExercise(exercises[exIdx])) return false
    if (!isRecord(log)) return false
    const w = Number(String(log.weight ?? '').replace(',', '.'))
    const r = Number(String(log.reps ?? '').replace(',', '.'))
    return (Number.isFinite(w) && w > 0) || (Number.isFinite(r) && r > 0)
  })
}

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
  //
  // ⚠️ O desconto pressupõe que o cardio aconteceu DENTRO da sessão cronometrada.
  // Quando não acontece — aula externa (FitDance, spinning) lançada no treino —,
  // o tempo declarado do cardio pode passar da duração registrada e a subtração
  // zerava TODA a musculação: caso real de 27/07/2026, sessão de 51 min com uma
  // aula de 60 min, 9 de 10 exercícios com 0 kcal. Se o cardio não cabe na
  // duração registrada, ele não aconteceu dentro dela — o cronômetro mediu só a
  // musculação. Então a força fica com a sessão inteira e o cardio soma por fora.
  const totalMin = totalTimeSeconds / 60
  const cardioFitsInSession = cardio.cardioMinutes > 0 && cardio.cardioMinutes < totalMin
  // Sem musculação registrada, a sessão É o cardio → desconta normal (força zera).
  const discountCardioTime = cardioFitsInSession || !hasNonCardioWork(sessionObj, sessionLogs)

  const strengthMin = discountCardioTime
    ? Math.max(0, totalMin - cardio.cardioMinutes)
    : totalMin
  const strengthExecMin = execSec > 0
    ? (discountCardioTime ? Math.max(0, execSec / 60 - cardio.cardioMinutes) : execSec / 60)
    : null

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

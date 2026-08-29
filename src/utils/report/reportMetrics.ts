
import type { UnknownRecord } from '@/types/app'
import { setVolume, setTopWeightReps, setTotalReps, setBestE1rm, sessionVolumeKg } from './setVolume'
import { detectSessionDeload, isDeloadSession, type SessionDeload } from './sessionDeload'
import { estimateSessionKcalBreakdown } from '@/utils/calories/sessionKcal'
import { sessionKcalInputs, type KcalProfileLike } from '@/utils/calories/sessionKcalInputs'
import { distributeKcalWithFixed } from '@/utils/calories/distributeKcal'
import { currentWeekRangeBrt } from '@/utils/cron/weekRangeBrt'

const isObject = (value: unknown): value is UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const toNumber = (value: unknown) => {
  const n = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const safeString = (value: unknown) => String(value ?? '').trim()

const resolveRestTime = (exercise: UnknownRecord) => {
  const v = exercise.restTime ?? exercise.rest_time ?? null
  const n = toNumber(v)
  return n > 0 ? n : null
}

const resolvePlannedSets = (exercise: UnknownRecord) => {
  const sets = toNumber(exercise.sets)
  if (sets > 0) return Math.round(sets)
  const details = Array.isArray(exercise.setDetails) ? exercise.setDetails : Array.isArray(exercise.set_details) ? exercise.set_details : []
  return details.length
}

const resolvePlannedReps = (exercise: UnknownRecord) => {
  const reps = safeString(exercise.reps)
  return reps || null
}

const buildLogVolume = (logs: UnknownRecord, exerciseIndex: number) => {
  let volume = 0
  let sets = 0
  let reps = 0
  let weightSum = 0
  let weightCount = 0
  // Melhor 1RM estimado do dia = MÁXIMO por série. Mesma fonte única (setBestE1rm)
  // do baseline histórico, pro Δ1RM comparar maçãs com maçãs.
  let bestE1rm = 0
  // Séries levadas à FALHA muscular. O flag já era gravado no log e ficava órfão —
  // nada no relatório lia, então a falha marcada durante o treino sumia do histórico.
  const failureSetIdxs: number[] = []
  Object.entries(logs).forEach(([key, value]) => {
    const parts = String(key || '').split('-')
    const eIdx = Number(parts[0])
    if (!Number.isFinite(eIdx) || eIdx !== exerciseIndex) return
    if (!isObject(value)) return
    // Aceita boolean e "true" (o log é serializado como JSON em workouts.notes).
    const failureRaw = value.failure ?? null
    if (failureRaw === true || String(failureRaw ?? '').toLowerCase() === 'true') {
      const sIdx = Number(parts[1])
      if (Number.isFinite(sIdx)) failureSetIdxs.push(sIdx)
    }
    const doneRaw = value.done ?? value.isDone ?? value.completed ?? null
    const done = doneRaw == null ? true : doneRaw === true || String(doneRaw || '').toLowerCase() === 'true'
    if (!done) return

    // ── Skip warmup / feeler sets — they don't count toward exercise stats ─
    const rawType = (value.set_type ?? value.setType) as string | null | undefined
    if (rawType === 'warmup' || rawType === 'feeler') return
    if (!rawType && (value.is_warmup || value.isWarmup)) return

    // 1RM do dia — fonte única (trata dropset/cluster/unilateral/normal/reps===1)
    const e1 = setBestE1rm(value)
    if (e1 > bestE1rm) bestE1rm = e1

    // ── VOLUME: fonte ÚNICA (setVolume), calculado UMA vez pra todos os formatos ──
    // Cada branch abaixo reimplementava a soma por conta própria e divergiam em
    // silêncio do card/PDF/IA. O pior era a isometria, que multiplicava peso ×
    // SEGUNDOS (prancha de 60 s com peso corporal = milhares de kg fantasma). Os
    // branches agora só derivam reps / peso médio / contagem de séries — o volume
    // nunca mais é recalculado aqui. Ver sessionVolumeKg em setVolume.ts.
    const setVol = setVolume(value)
    if (Number.isFinite(setVol) && setVol > 0) volume += setVol

    // ── Cluster: reps/peso médio vêm do topo (o saver grava lastWeight/total lá) ──
    if (isObject(value.cluster)) {
      if (setVol > 0) {
        const cTop = setTopWeightReps(value)
        if (cTop.reps > 0) reps += cTop.reps
        if (cTop.weight > 0) { weightSum += cTop.weight; weightCount += 1 }
      }
      sets += 1
      return
    }

    // ── Drop-set / Stripping: reps somam as etapas; peso médio = 1ª etapa (a principal) ──
    // Mesma estrutura `stages: [{weight,reps}]`.
    const dropSet = isObject(value.drop_set) ? (value.drop_set as UnknownRecord) : null
    const stripping = isObject(value.stripping) ? (value.stripping as UnknownRecord) : null
    const dropStages = dropSet && Array.isArray(dropSet.stages)
      ? (dropSet.stages as unknown[])
      : stripping && Array.isArray(stripping.stages)
        ? (stripping.stages as unknown[])
        : []
    if (dropStages.length > 0) {
      let totalReps = 0
      let firstWeight: number | null = null
      for (const stage of dropStages) {
        if (!isObject(stage)) continue
        const sw = toNumber((stage as UnknownRecord).weight)
        const sr = toNumber((stage as UnknownRecord).reps)
        if (sw > 0 && sr > 0) {
          totalReps += sr
          if (firstWeight === null) firstWeight = sw
        }
      }
      if (totalReps > 0) reps += totalReps
      if (firstWeight !== null) { weightSum += firstWeight; weightCount += 1 }
      sets += 1
      return
    }

    // ── Wave (onda): reps somam os tiers de cada onda; peso médio = tier pesado ──
    const wave = isObject(value.wave) ? (value.wave as UnknownRecord) : null
    const waveList = wave && Array.isArray(wave.waves) ? (wave.waves as unknown[]) : []
    if (waveList.length > 0) {
      let waveReps = 0
      for (const w of waveList) {
        if (!isObject(w)) continue
        waveReps += toNumber((w as UnknownRecord).heavy) + toNumber((w as UnknownRecord).medium) + toNumber((w as UnknownRecord).ultra)
      }
      if (waveReps > 0) reps += waveReps
      const bestW = toNumber(wave?.heavyWeight) || toNumber(wave?.weight)
      if (bestW > 0) { weightSum += bestW; weightCount += 1 }
      sets += 1
      return
    }

    // ── Plank / isometric: durationSeconds carries the actual hold time ──
    // ATENÇÃO: `repsVal` aqui vira a CONTAGEM (reps/segundos aguentados) — nunca
    // multiplicador de volume. Peso × segundos não é carga levantada; a energia da
    // isometria já entra pelo modelo MET das calorias.
    const durationSec = toNumber(value.durationSeconds ?? value.duration_seconds ?? 0)
    const weight = toNumber(value.weight ?? value.kg ?? value.load)
    const repsVal = durationSec > 0 ? durationSec : toNumber(value.reps)

    if (weight > 0 && repsVal > 0) {
      reps += repsVal
      // "Peso médio" só faz sentido onde houve carga LEVANTADA (volume > 0). Na
      // isometria o campo `weight` é preenchido com o PESO CORPORAL por default
      // (PlankSetInput), então contá-lo aqui punha a tabela do relatório numa
      // contradição visível desde que o volume da prancha passou a ser 0:
      // "Peso médio 96,8 kg" na mesma linha de "Volume —".
      if (setVol > 0) { weightSum += weight; weightCount += 1 }
    } else if (repsVal > 0) {
      reps += repsVal
    } else {
      // Unilateral (L_weight/R_weight) NÃO grava weight/reps no topo → reps/peso
      // médio saem da fonte única (setTopWeightReps/setTotalReps, somando L+R).
      if (setVol > 0) {
        const top = setTopWeightReps(value)
        if (top.weight > 0) { weightSum += top.weight; weightCount += 1 }
        // Reps TOTAIS (L+R): o volume desta linha já soma os dois lados, então
        // contar só um lado deixava reps e volume falando línguas diferentes.
        const totalReps = setTotalReps(value)
        if (totalReps > 0) reps += totalReps
      }
    }
    sets += 1
  })
  const avgWeight = weightCount > 0 ? Math.round((weightSum / weightCount) * 10) / 10 : null
  return {
    volumeKg: Math.round(volume * 10) / 10,
    sets,
    reps,
    avgWeight,
    bestE1rm: bestE1rm > 0 ? Math.round(bestE1rm * 10) / 10 : null,
    failureSetIdxs: failureSetIdxs.sort((a, b) => a - b),
  }
}

/**
 * Parses a cadence string ("4-0-2-0", "3010", "40X0") and returns total
 * seconds per rep. Returns null if cadence is absent or unparseable.
 */
export const parseCadenceSecondsPerRep = (cadence: unknown): number | null => {
  const s = String(cadence ?? '').trim()
  if (!s) return null

  // Dash-separated: "4-0-2-0" or "3-1-2"
  if (s.includes('-')) {
    const parts = s.split('-')
    if (parts.length >= 2 && parts.length <= 4) {
      let total = 0
      let valid = true
      for (const p of parts) {
        const upper = p.trim().toUpperCase()
        if (upper === 'X' || upper === '') continue // explosive = ~0
        const n = parseInt(upper, 10)
        if (!Number.isFinite(n)) { valid = false; break }
        total += n
      }
      if (valid && total > 0) return total
    }
  }

  // Concatenated 4-char tempo: "3010", "40X0"
  if (/^[\dX]{4}$/i.test(s)) {
    let total = 0
    for (const c of s) {
      if (c.toUpperCase() === 'X') continue
      const n = parseInt(c, 10)
      if (!Number.isFinite(n)) return null
      total += n
    }
    return total > 0 ? total : null
  }

  return null
}

const REST_TOLERANCE = 0.20 // ±20 % counts as "on target"

const buildLogTimes = (
  logs: UnknownRecord,
  exerciseIndex: number,
  plannedRestSec: number | null = null,
  cadenceSecPerRep: number | null = null,
) => {
  let executionSeconds = 0
  let restSeconds = 0
  let restSetsTracked = 0
  let restOnTime = 0
  let restTooShort = 0
  let restTooLong = 0
  let cadenceSetsChecked = 0
  let cadenceExpectedSec = 0
  let cadenceActualSec = 0

  Object.entries(logs).forEach(([key, value]) => {
    const parts = String(key || '').split('-')
    const eIdx = Number(parts[0])
    if (!Number.isFinite(eIdx) || eIdx !== exerciseIndex) return
    if (!isObject(value)) return
    const doneRaw = value.done ?? value.isDone ?? value.completed ?? null
    const done = doneRaw == null ? true : doneRaw === true || String(doneRaw || '').toLowerCase() === 'true'
    if (!done) return
    // Tempo de execução. ISOMETRIA/CARDIO não gravam `executionSeconds` — o tempo
    // real está em `durationSeconds` (PlankSetInput/CardioSetInput). Sem este
    // fallback a coluna "Execução" da prancha ficava vazia embora o app soubesse
    // exatamente quantos segundos o usuário aguentou, e a série não tinha NENHUMA
    // base de rateio depois que o volume da isometria (corretamente) virou 0.
    const execRaw = toNumber((value as UnknownRecord).executionSeconds ?? (value as UnknownRecord).execution_seconds)
    const holdSec = toNumber((value as UnknownRecord).durationSeconds ?? (value as UnknownRecord).duration_seconds)
    const exec = execRaw > 0 ? execRaw : holdSec
    const rest = toNumber((value as UnknownRecord).restSeconds ?? (value as UnknownRecord).rest_seconds)
    if (exec > 0) executionSeconds += Math.round(exec)
    if (rest > 0) {
      restSeconds += Math.round(rest)
      restSetsTracked++
      if (plannedRestSec && plannedRestSec > 0) {
        const lo = plannedRestSec * (1 - REST_TOLERANCE)
        const hi = plannedRestSec * (1 + REST_TOLERANCE)
        if (rest < lo) restTooShort++
        else if (rest > hi) restTooLong++
        else restOnTime++
      }
    }
    if (cadenceSecPerRep && cadenceSecPerRep > 0 && exec > 0) {
      const reps = toNumber(value.reps)
      if (reps > 0) {
        cadenceSetsChecked++
        cadenceExpectedSec += Math.round(cadenceSecPerRep * reps)
        cadenceActualSec += Math.round(exec)
      }
    }
  })
  return {
    executionSeconds, restSeconds,
    restSetsTracked, restOnTime, restTooShort, restTooLong,
    cadenceSetsChecked, cadenceExpectedSec, cadenceActualSec,
  }
}

const buildPrevByExercise = (prevSession: UnknownRecord) => {
  const exercises = Array.isArray(prevSession.exercises) ? (prevSession.exercises as unknown[]) : []
  const logs = isObject(prevSession.logs) ? (prevSession.logs as UnknownRecord) : {}
  const map = new Map<string, { volumeKg: number; reps: number; avgWeightKg: number | null }>()
  exercises.forEach((raw, index) => {
    if (!isObject(raw)) return
    const name = safeString(raw.name)
    if (!name) return
    const logVolume = buildLogVolume(logs, index)
    map.set(name, { volumeKg: logVolume.volumeKg, reps: logVolume.reps, avgWeightKg: logVolume.avgWeight })
  })
  return map
}

/**
 * O domingo que abre a semana da data — pela FONTE ÚNICA do app.
 *
 * Até 28/08/2026 esta função calculava `(weekdayIndex + 6) % 7`, ou seja,
 * semana SEGUNDA→domingo, enquanto o app inteiro usa domingo→sábado desde
 * 24/08. O treino de domingo caía na semana anterior aqui e na semana atual no
 * resumo semanal, no push e no mapa muscular — o mesmo treino em duas semanas
 * diferentes, dependendo da tela.
 *
 * O guard `semanaComecaNoDomingo` não pegava: ele mira em três FORMAS de
 * calcular à mão (`setDate(...getDay())`, `getDate() - ...getDay()`,
 * `weekdayIndex === 0 ?`), e esta era uma quarta. Guard de forma erra quando a
 * forma muda — por isso a correção é adotar a fonte única, não inventar a
 * quinta forma.
 */
const getWeekStartSaoPaulo = (date: Date) =>
  new Date(currentWeekRangeBrt(date).startIso)

const extractSessionDateMs = (session: UnknownRecord) => {
  const raw = session.date ?? session.created_at ?? session.completed_at ?? session.updated_at ?? null
  const ms = raw ? new Date(String(raw)).getTime() : 0
  return Number.isFinite(ms) ? ms : 0
}

/**
 * Volume de uma sessão do HISTÓRICO (tendência semanal / flags de carga).
 *
 * Recalcula SEMPRE a partir dos logs, mesmo quando a sessão já tem
 * `reportMeta.totals.volumeKg` gravado: as sessões finalizadas até jul/2026
 * carregam o total inflado pela isometria (peso × segundos), e confiar nesse
 * número faria a semana inteira comparar carga fantasma. O reportMeta só entra
 * como último recurso (sessão sem mapa de logs legível).
 */
const getSessionVolumeKg = (session: UnknownRecord) => {
  const logs = isObject(session.logs) ? (session.logs as UnknownRecord) : {}
  const fromLogs = Math.round(sessionVolumeKg(logs) * 10) / 10
  if (fromLogs > 0) return fromLogs
  if (isObject(session.reportMeta) && isObject((session.reportMeta as UnknownRecord).totals)) {
    const totals = (session.reportMeta as UnknownRecord).totals as UnknownRecord
    const v = toNumber(totals.volumeKg)
    if (v > 0) return v
  }
  return 0
}

export type ReportExerciseMetrics = {
  name: string
  order: number
  restTimePlannedSec: number | null
  executionMinutes?: number
  restMinutes?: number
  setsPlanned: number
  repsPlanned: string | null
  volumeKg: number
  setsDone: number
  repsDone: number
  avgWeightKg: number | null
  /** Calorias estimadas do exercício (rateio do total da sessão). Σ = total. */
  caloriesKcal?: number
  /** Melhor 1RM estimado do dia (máx por série, Epley). null se sem carga válida. */
  bestE1rm: number | null
  /** Quantas séries deste exercício foram levadas à FALHA muscular (flag `failure`). */
  setsToFailure: number
  /** Índices (0-based) das séries levadas à falha — pra marcar 💥 na série certa. */
  failureSetIdxs: number[]
  delta: {
    volumeKg: number | null
    reps: number | null
    avgWeightKg: number | null
  }
}

export type RestCompliance = {
  setsTracked: number
  onTime: number
  tooShort: number
  tooLong: number
}

export type CadenceCompliance = {
  setsChecked: number
  avgExpectedSec: number | null
  avgActualSec: number | null
  /** Ratio actual/expected × 100. 100 = perfeito. */
  compliancePct: number | null
}

export type ReportMetrics = {
  generatedAt: string
  totals: {
    volumeKg: number
    setsDone: number
    repsDone: number
    exercisesCount: number
    durationMinutes: number
    executionMinutes?: number
    restMinutes?: number
    densityKgPerMin: number
    densityKgPerMinExec?: number
  }
  rest: {
    avgPlannedRestSec: number | null
    maxPlannedRestSec: number | null
    /** Average actual rest recorded via timer (null if not tracked) */
    avgActualRestSec: number | null
    /** Per-set compliance (null if no planned rest or no tracking) */
    compliance: RestCompliance | null
  }
  /** Cadence analysis (null if no exercises had cadence defined) */
  cadence: CadenceCompliance | null
  /** Descarga aplicada nesta sessão (null quando não houve). Derivado dos logs. */
  deload: SessionDeload | null
  exerciseOrder: string[]
  exercises: ReportExerciseMetrics[]
}

/**
 * @param profile perfil declarado do usuário (`snapshot.profile`). Sem ele, o
 *   rateio de kcal por exercício cai no peso default enquanto o card do
 *   relatório usa o peso real — e as parcelas deixam de somar o total exibido
 *   (era o efeito do `{}` que ficava aqui: 491 das 596 sessões em produção não
 *   têm peso no check-in, então o fallback da sessão não salvava esses casos).
 */
export const buildReportMetrics = (session: UnknownRecord, previousSession?: UnknownRecord | null, profile?: KcalProfileLike | null): ReportMetrics => {
  const exercises = Array.isArray(session.exercises) ? (session.exercises as unknown[]) : []
  const logs = isObject(session.logs) ? (session.logs as UnknownRecord) : {}
  const prevMap = previousSession && isObject(previousSession) ? buildPrevByExercise(previousSession) : null
  const exerciseOrder: string[] = []
  const metrics: ReportExerciseMetrics[] = []
  // Total NÃO é a soma dos exercícios: a soma por exercício perde os logs que não
  // casam com nenhum item de `exercises` (exercício removido/sem nome), e era mais
  // uma via de divergência com o card, o PDF e as métricas da IA — todos varrem o
  // mapa de logs inteiro. Fonte única: sessionVolumeKg.
  const totalVolume = sessionVolumeKg(logs)
  let totalSets = 0
  let totalReps = 0
  let restSum = 0
  let restCount = 0
  let restMax: number | null = null
  // Rest compliance accumulators
  let actualRestSum = 0
  let actualRestSetsTracked = 0
  let complianceOnTime = 0
  let complianceTooShort = 0
  let complianceTooLong = 0
  // Cadence compliance accumulators
  let cadenceTotalExpected = 0
  let cadenceTotalActual = 0
  let cadenceSetsChecked = 0

  exercises.forEach((raw, index) => {
    if (!isObject(raw)) return
    const name = safeString(raw.name)
    if (!name) return
    const rest = resolveRestTime(raw)
    const cadenceSecPerRep = parseCadenceSecondsPerRep(raw.cadence)
    const plannedSets = resolvePlannedSets(raw)
    const plannedReps = resolvePlannedReps(raw)
    const logVolume = buildLogVolume(logs, index)
    const logTimes = buildLogTimes(logs, index, rest, cadenceSecPerRep)
    const executionMinutes = logTimes.executionSeconds > 0 ? Math.round((logTimes.executionSeconds / 60) * 10) / 10 : null
    const restMinutes = logTimes.restSeconds > 0 ? Math.round((logTimes.restSeconds / 60) * 10) / 10 : null
    exerciseOrder.push(name)
    if (rest != null) {
      restSum += rest
      restCount += 1
      restMax = restMax == null ? rest : Math.max(restMax, rest)
    }
    // Aggregate actual rest
    if (logTimes.restSetsTracked > 0) {
      actualRestSum += logTimes.restSeconds
      actualRestSetsTracked += logTimes.restSetsTracked
    }
    // Aggregate rest compliance
    complianceOnTime += logTimes.restOnTime
    complianceTooShort += logTimes.restTooShort
    complianceTooLong += logTimes.restTooLong
    // Aggregate cadence compliance
    if (logTimes.cadenceSetsChecked > 0) {
      cadenceSetsChecked += logTimes.cadenceSetsChecked
      cadenceTotalExpected += logTimes.cadenceExpectedSec
      cadenceTotalActual += logTimes.cadenceActualSec
    }
    totalSets += logVolume.sets
    totalReps += logVolume.reps
    const prev = prevMap ? prevMap.get(name) : null
    const deltaVolume = prev && prev.volumeKg > 0 ? Math.round((logVolume.volumeKg - prev.volumeKg) * 10) / 10 : null
    const deltaReps = prev ? Math.round((logVolume.reps - prev.reps) * 10) / 10 : null
    const deltaAvgWeight = prev && prev.avgWeightKg != null && logVolume.avgWeight != null
      ? Math.round((logVolume.avgWeight - prev.avgWeightKg) * 10) / 10
      : null
    metrics.push({
      name,
      order: index + 1,
      restTimePlannedSec: rest,
      executionMinutes: executionMinutes != null && executionMinutes > 0 ? executionMinutes : undefined,
      restMinutes: restMinutes != null && restMinutes > 0 ? restMinutes : undefined,
      setsPlanned: plannedSets,
      repsPlanned: plannedReps,
      volumeKg: logVolume.volumeKg,
      setsDone: logVolume.sets,
      repsDone: logVolume.reps,
      avgWeightKg: logVolume.avgWeight,
      bestE1rm: logVolume.bestE1rm,
      setsToFailure: logVolume.failureSetIdxs.length,
      failureSetIdxs: logVolume.failureSetIdxs,
      delta: {
        volumeKg: deltaVolume,
        reps: deltaReps,
        avgWeightKg: deltaAvgWeight,
      },
    })
  })

  // Calorias por exercício: cada CARDIO recebe sua kcal-MET exata; a parte de
  // FORÇA é rateada entre os demais por tempo/volume. Σ = total exibido.
  // (cardioPerExerciseKcal é keyed por índice de session.exercises = order-1.)
  try {
    const bd = estimateSessionKcalBreakdown(session, sessionKcalInputs(session, profile))
    if (bd.total > 0 && metrics.length > 0) {
      const perExercise = distributeKcalWithFixed(
        metrics.map((m) => ({
          volumeKg: m.volumeKg,
          executionMinutes: m.executionMinutes,
          fixedKcal: bd.cardioPerExerciseKcal[(m.order ?? 0) - 1] ?? null,
        })),
        bd.strengthKcal,
      )
      metrics.forEach((m, i) => { m.caloriesKcal = perExercise[i] ?? 0 })
    }
  } catch { /* sem calorias — não bloqueia o resto do relatório */ }

  const avgActualRestSec = actualRestSetsTracked > 0
    ? Math.round(actualRestSum / actualRestSetsTracked)
    : null

  const hasRestCompliance = (complianceOnTime + complianceTooShort + complianceTooLong) > 0
  const compliance: RestCompliance | null = hasRestCompliance
    ? { setsTracked: complianceOnTime + complianceTooShort + complianceTooLong, onTime: complianceOnTime, tooShort: complianceTooShort, tooLong: complianceTooLong }
    : null

  const cadenceCompliance: CadenceCompliance | null = cadenceSetsChecked > 0 && cadenceTotalExpected > 0
    ? {
        setsChecked: cadenceSetsChecked,
        avgExpectedSec: Math.round((cadenceTotalExpected / cadenceSetsChecked) * 10) / 10,
        avgActualSec: Math.round((cadenceTotalActual / cadenceSetsChecked) * 10) / 10,
        compliancePct: Math.round((cadenceTotalActual / cadenceTotalExpected) * 1000) / 10,
      }
    : null

  const report: ReportMetrics = {
    generatedAt: new Date().toISOString(),
    totals: {
      volumeKg: Math.round(totalVolume * 10) / 10,
      setsDone: totalSets,
      repsDone: totalReps,
      exercisesCount: metrics.length,
      durationMinutes: 0,
      densityKgPerMin: 0,
    },
    rest: {
      avgPlannedRestSec: restCount ? Math.round(restSum / restCount) : null,
      maxPlannedRestSec: restMax,
      avgActualRestSec,
      compliance,
    },
    cadence: cadenceCompliance,
    deload: (() => { const d = detectSessionDeload(logs); return d.applied ? d : null })(),
    exerciseOrder,
    exercises: metrics,
  }
  return applyDurationToReport(report, session)
}

export type WeeklyVolumeStats = {
  currentWeekKg: number
  previousWeekKg: number
  deltaPct: number
  isHeavyWeek: boolean
}

export type TrainingLoadFlags = {
  dayDropPct: number
  weekDeltaPct: number
  isBadDay: boolean
  isHeavyWeek: boolean
  reason: string
}

export const buildTrainingLoadFlags = (currentSession: UnknownRecord, history: UnknownRecord[], weekly: WeeklyVolumeStats): TrainingLoadFlags => {
  const baseDate = extractSessionDateMs(currentSession) || Date.now()
  const prevSessions = (Array.isArray(history) ? history : [])
    .map((s) => (isObject(s) ? s : null))
    .filter((s): s is UnknownRecord => Boolean(s))
    // Sessão de DESCARGA não entra na média de referência: ela tem 15–22 % menos
    // carga por ordem do próprio app, então baixaria a régua e faria a sessão
    // normal seguinte parecer um pico.
    .filter((s) => !isDeloadSession(s))
    .map((s) => ({ ms: extractSessionDateMs(s), volume: getSessionVolumeKg(s) }))
    .filter((s) => s.ms > 0 && s.ms < baseDate)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 6)
  const currentVolume = getSessionVolumeKg(currentSession)
  const prevAvg = prevSessions.length
    ? prevSessions.reduce((sum, s) => sum + s.volume, 0) / prevSessions.length
    : 0
  const dayDropPct = prevAvg > 0 ? Math.round(((currentVolume - prevAvg) / prevAvg) * 1000) / 10 : 0
  const weekDeltaPct = weekly.deltaPct
  const isHeavyWeek = weekly.isHeavyWeek
  // Descarga PLANEJADA não é dia ruim. A queda é o objetivo do dia — sem esta
  // guarda o relatório acusa "queda no dia" e o Coach IA escreve que o aluno
  // regrediu justamente quando ele seguiu a orientação do app.
  const isDeloadDay = isDeloadSession(currentSession)
  const isBadDay = prevAvg > 0 && !isDeloadDay ? dayDropPct <= -10 : false
  const reason = isDeloadDay
    ? 'Sessão de descarga (deload) — queda de carga planejada'
    : isBadDay && isHeavyWeek
      ? 'Queda no dia com semana pesada'
      : isBadDay
        ? 'Queda no dia vs média recente'
        : isHeavyWeek
          ? 'Semana pesada sem queda crítica no dia'
          : 'Dentro do padrão recente'
  return { dayDropPct, weekDeltaPct, isBadDay, isHeavyWeek, reason }
}

export const buildWeeklyVolumeStats = (currentSession: UnknownRecord, history: UnknownRecord[]): WeeklyVolumeStats => {
  const baseDate = extractSessionDateMs(currentSession) || Date.now()
  const weekStart = getWeekStartSaoPaulo(new Date(baseDate))
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  const prevWeekEnd = weekStart
  const all = [currentSession, ...(Array.isArray(history) ? history : [])]

  let currentWeekKg = 0
  let previousWeekKg = 0

  all.forEach((s) => {
    if (!isObject(s)) return
    const ms = extractSessionDateMs(s)
    if (!ms) return
    const volume = getSessionVolumeKg(s)
    if (ms >= weekStart.getTime() && ms < weekEnd.getTime()) currentWeekKg += volume
    else if (ms >= prevWeekStart.getTime() && ms < prevWeekEnd.getTime()) previousWeekKg += volume
  })

  currentWeekKg = Math.round(currentWeekKg * 10) / 10
  previousWeekKg = Math.round(previousWeekKg * 10) / 10
  const deltaPct = previousWeekKg > 0 ? Math.round(((currentWeekKg - previousWeekKg) / previousWeekKg) * 1000) / 10 : 0
  const isHeavyWeek = previousWeekKg > 0 ? currentWeekKg >= previousWeekKg * 1.1 : false
  return { currentWeekKg, previousWeekKg, deltaPct, isHeavyWeek }
}

export const applyDurationToReport = (report: ReportMetrics, session: UnknownRecord): ReportMetrics => {
  const rawSeconds = toNumber(session.totalTime ?? session.realTotalTime ?? session.elapsedSeconds ?? 0)
  const minutes = rawSeconds > 0 ? Math.round((rawSeconds / 60) * 10) / 10 : 0
  const density = minutes > 0 ? Math.round((report.totals.volumeKg / minutes) * 10) / 10 : 0
  const execSeconds = toNumber(session.executionTotalSeconds ?? session.execution_total_seconds ?? 0)
  const restSeconds = toNumber(session.restTotalSeconds ?? session.rest_total_seconds ?? 0)
  const executionMinutes = execSeconds > 0 ? Math.round((execSeconds / 60) * 10) / 10 : 0
  const restMinutes = restSeconds > 0 ? Math.round((restSeconds / 60) * 10) / 10 : 0
  const densityExec = executionMinutes > 0 ? Math.round((report.totals.volumeKg / executionMinutes) * 10) / 10 : 0
  return {
    ...report,
    totals: {
      ...report.totals,
      durationMinutes: minutes,
      executionMinutes: executionMinutes > 0 ? executionMinutes : undefined,
      restMinutes: restMinutes > 0 ? restMinutes : undefined,
      densityKgPerMin: density,
      densityKgPerMinExec: densityExec > 0 ? densityExec : undefined,
    },
  }
}

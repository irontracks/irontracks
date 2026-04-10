
import type { UnknownRecord } from '@/types/app'

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
  Object.entries(logs).forEach(([key, value]) => {
    const parts = String(key || '').split('-')
    const eIdx = Number(parts[0])
    if (!Number.isFinite(eIdx) || eIdx !== exerciseIndex) return
    if (!isObject(value)) return
    const weight = toNumber(value.weight ?? value.kg ?? value.load)
    const repsVal = toNumber(value.reps)
    const doneRaw = value.done ?? value.isDone ?? value.completed ?? null
    const done = doneRaw == null ? true : doneRaw === true || String(doneRaw || '').toLowerCase() === 'true'
    if (!done) return
    if (weight > 0 && repsVal > 0) {
      volume += weight * repsVal
      reps += repsVal
      weightSum += weight
      weightCount += 1
    } else if (repsVal > 0) {
      reps += repsVal
    }
    sets += 1
  })
  const avgWeight = weightCount > 0 ? Math.round((weightSum / weightCount) * 10) / 10 : null
  return { volumeKg: Math.round(volume * 10) / 10, sets, reps, avgWeight }
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
    const exec = toNumber((value as UnknownRecord).executionSeconds ?? (value as UnknownRecord).execution_seconds)
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

const toTzParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const map = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value
    return acc
  }, {})
  const weekday = String(map.weekday || '').toLowerCase()
  const weekdayIndex =
    weekday === 'mon' ? 1 : weekday === 'tue' ? 2 : weekday === 'wed' ? 3 : weekday === 'thu' ? 4 : weekday === 'fri' ? 5 : weekday === 'sat' ? 6 : 0
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekdayIndex,
  }
}

const tzDateToUtc = (timeZone: string, year: number, month: number, day: number, hour: number, minute: number, second: number) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const tzDate = new Date(utcGuess.toLocaleString('en-US', { timeZone }))
  const offset = utcGuess.getTime() - tzDate.getTime()
  return new Date(utcGuess.getTime() + offset)
}

const getWeekStartSaoPaulo = (date: Date) => {
  const timeZone = 'America/Sao_Paulo'
  const parts = toTzParts(date, timeZone)
  const daysSinceMonday = (parts.weekdayIndex + 6) % 7
  const mondayDay = parts.day - daysSinceMonday
  const weekStart = tzDateToUtc(timeZone, parts.year, parts.month, mondayDay, 3, 0, 0)
  if (date.getTime() < weekStart.getTime()) {
    return new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  }
  return weekStart
}

const extractSessionDateMs = (session: UnknownRecord) => {
  const raw = session.date ?? session.created_at ?? session.completed_at ?? session.updated_at ?? null
  const ms = raw ? new Date(String(raw)).getTime() : 0
  return Number.isFinite(ms) ? ms : 0
}

const getSessionVolumeKg = (session: UnknownRecord) => {
  if (isObject(session.reportMeta) && isObject((session.reportMeta as UnknownRecord).totals)) {
    const totals = (session.reportMeta as UnknownRecord).totals as UnknownRecord
    const v = toNumber(totals.volumeKg)
    if (v > 0) return v
  }
  const exercises = Array.isArray(session.exercises) ? (session.exercises as unknown[]) : []
  const logs = isObject(session.logs) ? (session.logs as UnknownRecord) : {}
  let total = 0
  exercises.forEach((raw, index) => {
    if (!isObject(raw)) return
    total += buildLogVolume(logs, index).volumeKg
  })
  return Math.round(total * 10) / 10
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
  exerciseOrder: string[]
  exercises: ReportExerciseMetrics[]
}

export const buildReportMetrics = (session: UnknownRecord, previousSession?: UnknownRecord | null): ReportMetrics => {
  const exercises = Array.isArray(session.exercises) ? (session.exercises as unknown[]) : []
  const logs = isObject(session.logs) ? (session.logs as UnknownRecord) : {}
  const prevMap = previousSession && isObject(previousSession) ? buildPrevByExercise(previousSession) : null
  const exerciseOrder: string[] = []
  const metrics: ReportExerciseMetrics[] = []
  let totalVolume = 0
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
    totalVolume += logVolume.volumeKg
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
      delta: {
        volumeKg: deltaVolume,
        reps: deltaReps,
        avgWeightKg: deltaAvgWeight,
      },
    })
  })

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
  const isBadDay = prevAvg > 0 ? dayDropPct <= -10 : false
  const reason = isBadDay && isHeavyWeek
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

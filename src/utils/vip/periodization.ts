import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { parseTrainingNumber } from '@/utils/trainingNumber'
import { vipPeriodizationExerciseSeed, VipExerciseSeed } from '@/data/vipPeriodizationExercises'

export type VipPeriodizationModel = 'linear' | 'undulating'
export type VipPeriodizationWeeks = 4 | 6 | 8
export type VipPeriodizationGoal = 'hypertrophy' | 'strength' | 'recomp'
export type VipExperienceLevel = 'beginner' | 'intermediate' | 'advanced'

export type VipPeriodizationQuestionnaire = {
  model: VipPeriodizationModel
  weeks: VipPeriodizationWeeks
  goal: VipPeriodizationGoal
  level: VipExperienceLevel
  daysPerWeek: number
  timeMinutes: number
  equipment: string[]
  limitations: string
  preferredSplit?: string
  focusMuscles?: string[]
  startDate?: string | null
}

export type VipPeriodizationWeek = {
  weekNumber: number
  phase: 'adaptation' | 'progression' | 'peak' | 'deload' | 'test'
  isDeload: boolean
  isTest: boolean
  intensityMainPct: number
  volumeMultiplier: number
  densityMultiplier: number
}

export type VipWorkoutDay = {
  weekNumber: number
  dayNumber: number
  splitDay: string
  phase: VipPeriodizationWeek['phase']
  isDeload: boolean
  isTest: boolean
  scheduledDate: string | null
  name: string
  notes: string
  exercises: VipWorkoutExercise[]
}

export type VipWorkoutExercise = {
  name: string
  primary_muscle: string
  is_compound: boolean
  video_url?: string | null
  rest_time?: number | null
  method?: string | null
  cadence?: string | null
  order: number
  sets: Array<{
    set_number: number
    weight: number | null
    reps: string | null
    rpe: string | null
    is_warmup: boolean
    advanced_config: Record<string, unknown> | null
  }>
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const roundTo25 = (v: number) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const step = 2.5
  return Math.round(n / step) * step
}

const safeString = (v: unknown) => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

const safeNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : parseTrainingNumber(v)
  return Number.isFinite(n) ? Number(n) : null
}

export const estimate1Rm = (weight: unknown, reps: unknown): number | null => {
  const w = safeNumber(weight)
  const r = safeNumber(reps)
  if (w == null || r == null) return null
  if (w <= 0 || r <= 0) return null
  return w * (1 + r / 30)
}

export const computeWeeks = (weeks: VipPeriodizationWeeks, model: VipPeriodizationModel): VipPeriodizationWeek[] => {
  const deloadWeeksByPlan: Record<number, number[]> = { 4: [3], 6: [4, 6], 8: [4, 6] }
  const testWeek = weeks
  const deloadWeeks = new Set<number>(deloadWeeksByPlan[weeks] ?? [])
  const list: VipPeriodizationWeek[] = []

  for (let w = 1; w <= weeks; w += 1) {
    const isTest = w === testWeek
    const isDeload = !isTest && deloadWeeks.has(w)
    const phase: VipPeriodizationWeek['phase'] = isTest ? 'test' : isDeload ? 'deload' : w <= Math.ceil(weeks / 3) ? 'adaptation' : w < weeks - 1 ? 'progression' : 'peak'

    const baseLinear = (() => {
      if (phase === 'adaptation') return 0.67
      if (phase === 'progression') return 0.75
      if (phase === 'peak') return 0.83
      if (phase === 'deload') return 0.58
      return 0.75
    })()

    const weeklyStep = weeks === 4 ? 0.03 : weeks === 6 ? 0.025 : 0.02
    const intensityLinear = clamp(baseLinear + (w - 1) * weeklyStep, 0.55, 0.9)

    const intensityMainPct =
      model === 'linear'
        ? intensityLinear
        : clamp(
            intensityLinear + (w % 2 === 0 ? 0.03 : -0.02),
            phase === 'deload' ? 0.5 : 0.55,
            phase === 'test' ? 0.85 : 0.9,
          )

    const volumeMultiplier = phase === 'deload' ? 0.55 : phase === 'peak' ? 0.85 : phase === 'test' ? 0.6 : 1
    const densityMultiplier = phase === 'deload' ? 0.9 : phase === 'peak' ? 0.95 : 1

    list.push({
      weekNumber: w,
      phase,
      isDeload,
      isTest,
      intensityMainPct,
      volumeMultiplier,
      densityMultiplier,
    })
  }

  return list
}

export const chooseSplit = (q: VipPeriodizationQuestionnaire): { split: string; days: string[] } => {
  const days = clamp(Math.floor(Number(q.daysPerWeek) || 4), 2, 6)
  const pref = safeString(q.preferredSplit)
  if (pref) {
    const p = pref.toLowerCase()
    if (p.includes('full')) return { split: 'full_body', days: Array.from({ length: days }).map((_, i) => `Full Body ${String.fromCharCode(65 + i)}`) }
    if (p.includes('upper') || p.includes('lower')) return { split: 'upper_lower', days: days >= 4 ? ['Upper A', 'Lower A', 'Upper B', 'Lower B'].slice(0, days) : ['Upper', 'Lower', 'Upper'].slice(0, days) }
    if (p.includes('push') || p.includes('pull') || p.includes('legs')) return { split: 'ppl', days: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'].slice(0, days) }
    if (p.includes('bro') || p.includes('body')) return { split: 'bro_split', days: ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços', 'Full'].slice(0, days) }
  }

  if (q.weeks === 4) {
    if (days <= 3) return { split: 'full_body', days: ['Full Body A', 'Full Body B', 'Full Body C'].slice(0, days) }
    return { split: 'upper_lower', days: ['Upper A', 'Lower A', 'Upper B', 'Lower B', 'Upper C', 'Lower C'].slice(0, days) }
  }
  if (q.weeks === 6) {
    if (days <= 3) return { split: 'ppl', days: ['Push', 'Pull', 'Legs'] }
    return { split: 'ppl', days: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'].slice(0, days) }
  }
  if (days <= 4) return { split: 'upper_lower', days: ['Upper A', 'Lower A', 'Upper B', 'Lower B'].slice(0, days) }
  return { split: 'bro_split', days: ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços'].slice(0, days) }
}

const repScheme = (goal: VipPeriodizationGoal, phase: VipPeriodizationWeek['phase'], isCompound: boolean, level: VipExperienceLevel) => {
  if (phase === 'deload') return { reps: isCompound ? '6-8' : '10-12', sets: isCompound ? 2 : 2, rpe: goal === 'strength' ? '6-7' : '6-7' }
  if (phase === 'test') return { reps: isCompound ? 'AMRAP' : '12', sets: isCompound ? 1 : 2, rpe: isCompound ? '9' : '8' }
  if (goal === 'strength') {
    if (phase === 'peak') return { reps: isCompound ? '3-5' : '8-10', sets: isCompound ? (level === 'advanced' ? 4 : 3) : 3, rpe: '8-9' }
    if (phase === 'progression') return { reps: isCompound ? '4-6' : '10-12', sets: isCompound ? 3 : 3, rpe: '7-8' }
    return { reps: isCompound ? '5-7' : '12-15', sets: isCompound ? 3 : 2, rpe: '7' }
  }
  if (phase === 'peak') return { reps: isCompound ? '6-8' : '10-12', sets: isCompound ? 3 : 3, rpe: '8' }
  if (phase === 'progression') return { reps: isCompound ? '8-10' : '12-15', sets: isCompound ? 3 : 3, rpe: '7-8' }
  return { reps: isCompound ? '10-12' : '12-15', sets: isCompound ? 3 : 2, rpe: '7' }
}

export const filterSeedByEquipment = (seed: VipExerciseSeed[], equipment: string[], env: Array<'home' | 'gym'>) => {
  const envTokens = new Set(['gym', 'academia', 'academy', 'home', 'casa', 'home gym', 'home_gym'])
  const equip = new Set(
    (Array.isArray(equipment) ? equipment : [])
      .map((e) => safeString(e).toLowerCase())
      .filter((e) => Boolean(e) && !envTokens.has(e)),
  )
  const envSet = new Set(env)
  return seed.filter((ex) => {
    const environments = Array.isArray(ex.environments) ? ex.environments : []
    const okEnv = environments.some((e) => envSet.has(e))
    if (!okEnv) return false
    if (!equip.size) return true
    const exEquip = Array.isArray(ex.equipment) ? ex.equipment : []
    return exEquip.some((e) => equip.has(String(e || '').toLowerCase()))
  })
}

const pickExercises = (seed: VipExerciseSeed[], primaryMuscles: string[], count: number) => {
  const pool = seed.filter((e) => primaryMuscles.includes(String(e.primary_muscle || '').toLowerCase()))
  const shuffled = pool.slice().sort(() => (Math.random() > 0.5 ? 1 : -1))
  return shuffled.slice(0, Math.max(0, Math.floor(count)))
}

export const buildWorkoutPlan = (q: VipPeriodizationQuestionnaire, opts: { getEst1rm?: (normalizedName: string) => number | null } = {}) => {
  const weeks = computeWeeks(q.weeks, q.model)
  const split = chooseSplit(q)
  const eq = Array.isArray(q.equipment) ? q.equipment : []
  const hasHome = eq.some((e) => String(e || '').toLowerCase().includes('home') || String(e || '').toLowerCase().includes('casa'))
  const hasGym = eq.some((e) => String(e || '').toLowerCase().includes('gym') || String(e || '').toLowerCase().includes('academ'))
  const env: Array<'home' | 'gym'> = hasHome && !hasGym ? ['home'] : hasGym && !hasHome ? ['gym'] : ['gym', 'home']
  const seed = filterSeedByEquipment(vipPeriodizationExerciseSeed, q.equipment, env)

  const startDate = (() => {
    const s = safeString(q.startDate)
    if (!s) return null
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return null
    return d
  })()

  const days = split.days.length
  const dayMs = 24 * 60 * 60 * 1000

  const volumeBase = q.goal === 'strength' ? 12 : 14
  const perDayExercises = clamp(Math.round((q.timeMinutes || 60) / 15), 4, 7)

  const planDays: VipWorkoutDay[] = []

  weeks.forEach((w) => {
    for (let d = 1; d <= days; d += 1) {
      const splitDay = split.days[d - 1] || `Dia ${d}`
      const dayTitle = `W${w.weekNumber} D${d} • ${splitDay}`

      const primary = (() => {
        const key = splitDay.toLowerCase()
        if (key.includes('upper')) return ['peito', 'costas', 'ombros', 'triceps', 'biceps']
        if (key.includes('lower') || key.includes('legs') || key.includes('pernas')) return ['quadriceps', 'posterior_de_coxa', 'gluteos', 'panturrilhas']
        if (key.includes('push')) return ['peito', 'ombros', 'triceps']
        if (key.includes('pull')) return ['costas', 'biceps', 'trapezio', 'ombros_posteriores']
        if (key.includes('peito')) return ['peito', 'triceps', 'ombros']
        if (key.includes('costas')) return ['costas', 'biceps', 'ombros_posteriores']
        if (key.includes('ombros')) return ['ombros', 'ombros_posteriores', 'trapezio']
        if (key.includes('bracos') || key.includes('braços')) return ['biceps', 'triceps', 'antebraco']
        return ['quadriceps', 'costas', 'peito', 'ombros', 'gluteos']
      })()

      const pickCount = perDayExercises
      const selected = pickExercises(seed, primary.map((p) => p.toLowerCase()), pickCount)

      const exercises: VipWorkoutExercise[] = selected.map((ex, idx) => {
        const rs = repScheme(q.goal, w.phase, ex.is_compound, q.level)
        const baseSets = Math.max(1, Math.round((rs.sets * w.volumeMultiplier * (q.level === 'advanced' ? 1.05 : q.level === 'beginner' ? 0.9 : 1))))
        const setsCount = clamp(baseSets, ex.is_compound ? 2 : 1, ex.is_compound ? 5 : 4)

        const intensity = (() => {
          if (w.phase === 'test') return ex.is_compound ? 0.75 : w.intensityMainPct
          if (!ex.is_compound) return clamp(w.intensityMainPct - 0.15, 0.45, 0.8)
          return w.intensityMainPct
        })()

        const est1rm = opts.getEst1rm ? opts.getEst1rm(normalizeExerciseName(ex.display_name_pt)) : null
        const baseWeight = est1rm ? roundTo25(est1rm * intensity) : null

        const rest = ex.is_compound ? (q.goal === 'strength' || w.phase === 'peak' ? 150 : 120) : 75
        const restAdj = Math.round(rest * w.densityMultiplier)

        const setRows = Array.from({ length: setsCount }).map((_, sIdx) => {
          const warmup = ex.is_compound && sIdx === 0 && w.phase !== 'test'
          const weight = warmup && baseWeight ? roundTo25(baseWeight * 0.6) : baseWeight
          const reps = warmup ? '8' : rs.reps
          const cfg: Record<string, unknown> = {
            weight: weight ?? null,
            vip_periodization: {
              model: q.model,
              weeks: q.weeks,
              week: w.weekNumber,
              phase: w.phase,
              intensity_pct: intensity,
              deload: w.isDeload,
              test: w.isTest,
            },
          }
          return {
            set_number: sIdx + 1,
            weight: weight ?? null,
            reps,
            rpe: rs.rpe,
            is_warmup: warmup,
            advanced_config: cfg,
          }
        })

        return {
          name: ex.display_name_pt,
          primary_muscle: ex.primary_muscle,
          is_compound: ex.is_compound,
          rest_time: restAdj,
          method: null as string | null,
          cadence: null as string | null,
          order: idx,
          sets: setRows,
        }
      })

      const scheduledDate = startDate ? new Date(startDate.getTime() + (w.weekNumber - 1) * 7 * dayMs + (d - 1) * dayMs).toISOString().slice(0, 10) : null
      const totalTargetSets = Math.round(volumeBase * w.volumeMultiplier)
      const notes = [
        `Fase: ${w.phase}`,
        w.isDeload ? 'Semana de deload: reduza volume e mantenha técnica.' : '',
        w.isTest ? 'Semana de teste: use AMRAP no principal e atualize seu 1RM estimado.' : '',
        `Meta: ~${totalTargetSets} séries efetivas`,
      ]
        .filter(Boolean)
        .join('\n')

      planDays.push({
        weekNumber: w.weekNumber,
        dayNumber: d,
        splitDay,
        phase: w.phase,
        isDeload: w.isDeload,
        isTest: w.isTest,
        scheduledDate,
        name: dayTitle,
        notes,
        exercises,
      })
    }
  })

  return { weeks, split, days: planDays }
}

export const parseSessionFromNotes = (notes: unknown): Record<string, unknown> | null => {
  const raw = safeString(notes)
  if (!raw) return null
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj as Record<string, unknown>
    return null
  } catch {
    return null
  }
}

export const computeWeeklyStatsFromSessions = (sessions: Array<{ created_at: string; notes: unknown }>) => {
  const byWeek = new Map<string, { weekStart: string; volume: number; best1rm: number }>()

  const getWeekStartIso = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const day = d.getUTCDay()
    const diff = (day + 6) % 7
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    start.setUTCDate(start.getUTCDate() - diff)
    return start.toISOString().slice(0, 10)
  }

  for (const row of sessions) {
    const createdAt = safeString(row.created_at)
    if (!createdAt) continue
    const weekStart = getWeekStartIso(createdAt)
    if (!weekStart) continue
    const cur = byWeek.get(weekStart) || { weekStart, volume: 0, best1rm: 0 }

    const session = parseSessionFromNotes(row.notes)
    const logs = session && typeof session.logs === 'object' && session.logs ? (session.logs as Record<string, unknown>) : null
    if (logs) {
      for (const [, v] of Object.entries(logs)) {
        const log = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
        if (!log) continue
        const doneRaw = log.done ?? log.isDone ?? log.completed ?? null
        const done = doneRaw == null ? true : doneRaw === true || String(doneRaw || '').toLowerCase() === 'true'
        const weight = safeNumber(log.weight)
        const reps = safeNumber(log.reps)
        if (!done && (weight == null || reps == null)) continue
        if (weight != null && reps != null && weight > 0 && reps > 0) {
          cur.volume += weight * reps
          const est = estimate1Rm(weight, reps)
          if (est != null && est > cur.best1rm) cur.best1rm = est
        }
      }
    }

    byWeek.set(weekStart, cur)
  }

  return Array.from(byWeek.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

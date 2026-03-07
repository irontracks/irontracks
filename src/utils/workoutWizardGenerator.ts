import type {
  WorkoutDraft,
  WorkoutWizardAnswers,
  WorkoutWizardEquipment,
  WorkoutWizardFocus,
  WorkoutWizardGoal,
  WorkoutWizardLevel,
  WorkoutWizardSplit,
} from '@/components/dashboard/WorkoutWizardModal'
import { resolveCanonicalExerciseName } from '@/utils/exerciseCanonical'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'

type RepScheme = {
  sets: number
  reps: string
  restTime: number
  rpe: number | null
}

const normalizeText = (v: string) =>
  (v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const pick = <T,>(arr: T[], idx: number, seed: number) => {
  const list = Array.isArray(arr) ? arr : []
  if (!list.length) return undefined
  const safeSeed = Number.isFinite(seed) ? Math.max(0, Math.floor(seed)) : 0
  const safeIdx = Number.isFinite(idx) ? Math.max(0, Math.floor(idx)) : 0
  const pos = (safeIdx + safeSeed) % list.length
  return list[pos]
}

const schemeFor = (goal: WorkoutWizardGoal, level: WorkoutWizardLevel): RepScheme => {
  const base: RepScheme =
    goal === 'strength'
      ? { sets: 5, reps: '3-6', restTime: 150, rpe: 8 }
      : goal === 'conditioning'
        ? { sets: 3, reps: '12-20', restTime: 45, rpe: 7 }
        : goal === 'maintenance'
          ? { sets: 3, reps: '6-10', restTime: 90, rpe: 7 }
          : { sets: 4, reps: '8-12', restTime: 75, rpe: 8 }
  if (level === 'beginner') return { ...base, sets: Math.max(2, Math.min(base.sets, 3)), rpe: base.rpe != null ? 7 : null }
  if (level === 'advanced') return base
  return { ...base, sets: Math.max(3, Math.min(base.sets, 4)) }
}

const countByTime = (timeMinutes: number) => {
  if (timeMinutes <= 30) return { main: 4, accessory: 0, core: 0 }
  if (timeMinutes <= 45) return { main: 5, accessory: 1, core: 1 }
  if (timeMinutes <= 60) return { main: 6, accessory: 1, core: 1 }
  if (timeMinutes <= 90) return { main: 7, accessory: 2, core: 1 }
  return { main: 8, accessory: 2, core: 1 }
}

const isKneeSensitive = (constraints: string) => {
  const t = normalizeText(constraints)
  return t.includes('joelho') || t.includes('patelar') || t.includes('lca') || t.includes('menisco')
}

const isShoulderSensitive = (constraints: string) => {
  const t = normalizeText(constraints)
  return t.includes('ombro') || t.includes('manguito') || t.includes('supraespinhal') || t.includes('impingement')
}

const normalizeAnswers = (raw: unknown): WorkoutWizardAnswers => {
  const a = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const goalRaw = String(a.goal || '').trim()
  const splitRaw = String(a.split || '').trim()
  const levelRaw = String(a.level || '').trim()
  const focusRaw = String(a.focus || '').trim()
  const equipmentRaw = String(a.equipment || '').trim()
  const goal: WorkoutWizardGoal =
    goalRaw === 'strength' || goalRaw === 'conditioning' || goalRaw === 'maintenance' ? (goalRaw as WorkoutWizardGoal) : 'hypertrophy'
  const split: WorkoutWizardSplit =
    splitRaw === 'upper_lower' || splitRaw === 'ppl' ? (splitRaw as WorkoutWizardSplit) : 'full_body'
  const level: WorkoutWizardLevel =
    levelRaw === 'beginner' || levelRaw === 'advanced' ? (levelRaw as WorkoutWizardLevel) : 'intermediate'
  const focus: WorkoutWizardFocus =
    focusRaw === 'upper' || focusRaw === 'lower' || focusRaw === 'push' || focusRaw === 'pull' || focusRaw === 'legs'
      ? (focusRaw as WorkoutWizardFocus)
      : 'balanced'
  const equipment: WorkoutWizardEquipment =
    equipmentRaw === 'home' || equipmentRaw === 'minimal' ? (equipmentRaw as WorkoutWizardEquipment) : 'gym'
  const daysPerWeekRaw = Number(a.daysPerWeek)
  const daysPerWeek: WorkoutWizardAnswers['daysPerWeek'] =
    daysPerWeekRaw === 2 || daysPerWeekRaw === 4 || daysPerWeekRaw === 5 || daysPerWeekRaw === 6 ? daysPerWeekRaw : 3
  const timeRaw = Number(a.timeMinutes)
  const timeMinutes: WorkoutWizardAnswers['timeMinutes'] =
    timeRaw === 30 || timeRaw === 45 || timeRaw === 60 || timeRaw === 90 || timeRaw === 120 ? timeRaw : 60
  const constraints = String(a.constraints || '')
  return { goal, split, level, focus, equipment, daysPerWeek, timeMinutes, constraints }
}

const normalizeExerciseKey = (value: string) => normalizeText(value).replace(/\s+/g, ' ').trim()

const restBoundsForGoal = (goal: WorkoutWizardGoal) => {
  if (goal === 'conditioning') return { min: 30, max: 60 }
  if (goal === 'strength') return { min: 120, max: 180 }
  if (goal === 'maintenance') return { min: 60, max: 120 }
  return { min: 60, max: 120 }
}

const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const normalizeReps = (raw: unknown, fallback: string) => {
  const s = String(raw ?? '').trim()
  return s ? s : fallback
}

const isCoreExercise = (name: string, coreList: string[]) => {
  const key = normalizeExerciseKey(name)
  return coreList.some((c) => normalizeExerciseKey(c) === key)
}

const shouldSwapKnee = (name: string) => {
  const t = normalizeText(name)
  return t.includes('agachamento') || t.includes('leg press') || t.includes('extensora') || t.includes('afundo') || t.includes('lunge')
}

const shouldSwapShoulder = (name: string) => {
  const t = normalizeText(name)
  return t.includes('supino') || t.includes('desenvolvimento') || t.includes('ombro') || t.includes('elevação') || t.includes('paralelas')
}

const catalog = (equipment: WorkoutWizardEquipment) => {
  if (equipment === 'minimal') {
    return {
      push: ['Flexão', 'Flexão inclinada', 'Flexão diamante'],
      pull: ['Remada com elástico', 'Remada unilateral com halter', 'Puxada com elástico'],
      legs: ['Agachamento livre', 'Agachamento búlgaro', 'Levantamento terra romeno com halteres'],
      hinge: ['Levantamento terra romeno com halteres', 'Ponte de glúteos', 'Good morning com elástico'],
      core: ['Prancha', 'Dead bug', 'Abdominal infra'],
    }
  }
  if (equipment === 'home') {
    return {
      push: ['Supino com halteres', 'Desenvolvimento com halteres', 'Paralelas (banco)'],
      pull: ['Remada unilateral com halter', 'Puxada com elástico', 'Remada curvada com halteres'],
      legs: ['Agachamento goblet', 'Agachamento búlgaro', 'Afundo'],
      hinge: ['Levantamento terra romeno com halteres', 'Ponte de glúteos', 'Stiff com halteres'],
      core: ['Prancha', 'Dead bug', 'Abdominal infra'],
    }
  }
  return {
    push: ['Supino reto', 'Supino inclinado', 'Desenvolvimento militar', 'Crossover', 'Tríceps na polia'],
    pull: ['Puxada na barra', 'Remada baixa', 'Remada curvada', 'Face pull', 'Rosca direta'],
    legs: ['Agachamento livre', 'Leg press', 'Cadeira extensora', 'Cadeira flexora', 'Panturrilha em pé'],
    hinge: ['Levantamento terra romeno', 'Stiff', 'Hip thrust', 'Good morning'],
    core: ['Prancha', 'Crunch', 'Abdominal infra'],
  }
}

const resolvePrimaryPattern = (split: WorkoutWizardSplit, focus: WorkoutWizardFocus) => {
  if (split === 'full_body') return 'full'
  if (split === 'upper_lower') return focus === 'lower' ? 'lower' : 'upper'
  if (split === 'ppl') return focus === 'pull' ? 'pull' : focus === 'legs' ? 'legs' : 'push'
  return 'full'
}

const titleFor = (goal: WorkoutWizardGoal, split: WorkoutWizardSplit, focus: WorkoutWizardFocus) => {
  const g = goal === 'hypertrophy' ? 'Hipertrofia' : goal === 'strength' ? 'Força' : goal === 'conditioning' ? 'Condicionamento' : 'Manutenção'
  const s = split === 'full_body' ? 'Full Body' : split === 'upper_lower' ? 'Upper/Lower' : 'PPL'
  const f =
    focus === 'balanced'
      ? ''
      : focus === 'upper'
        ? ' (Upper)'
        : focus === 'lower'
          ? ' (Lower)'
          : focus === 'push'
            ? ' (Push)'
            : focus === 'pull'
              ? ' (Pull)'
              : ' (Pernas)'
  return `${g} • ${s}${f}`.trim()
}

type WizardConsistencyContext = {
  recentExercises?: string[]
  recentCount14?: number
  recentExerciseStats?: Record<string, { avgReps: number; setsCount: number }>
  progressionTargets?: Record<string, { min: number; max: number }>
  deload?: boolean
}

const buildRecentKeys = (items?: string[]) => {
  const list = Array.isArray(items) ? items : []
  return new Set(list.map((v) => normalizeExerciseKey(String(v || ''))).filter(Boolean))
}

const findCatalogGroup = (name: string, baseCatalog: ReturnType<typeof catalog>) => {
  const key = normalizeExerciseKey(name)
  if (!key) return null
  const groups = [baseCatalog.push, baseCatalog.pull, baseCatalog.legs, baseCatalog.hinge, baseCatalog.core]
  for (const g of groups) {
    if (!Array.isArray(g)) continue
    const has = g.some((n) => normalizeExerciseKey(n) === key)
    if (has) return g
  }
  return null
}

const pickAlternative = (group: string[], currentKey: string, idx: number, seed: number) => {
  const list = Array.isArray(group) ? group : []
  if (!list.length) return null
  for (let i = 0; i < list.length; i += 1) {
    const cand = pick(list, idx + i + 1, seed)
    const key = normalizeExerciseKey(String(cand || ''))
    if (key && key !== currentKey) return String(cand)
  }
  return null
}

const mapRecentPatternCounts = (recent: string[], baseCatalog: ReturnType<typeof catalog>) => {
  const counts = { push: 0, pull: 0, legs: 0, hinge: 0, core: 0 }
  for (const name of recent) {
    const group = findCatalogGroup(name, baseCatalog)
    if (!group) continue
    if (group === baseCatalog.push) counts.push += 1
    else if (group === baseCatalog.pull) counts.pull += 1
    else if (group === baseCatalog.legs) counts.legs += 1
    else if (group === baseCatalog.hinge) counts.hinge += 1
    else if (group === baseCatalog.core) counts.core += 1
  }
  return counts
}

const pickLeastUsedGroup = (
  groups: Array<{ key: keyof ReturnType<typeof mapRecentPatternCounts>; items: string[] }>,
  counts: ReturnType<typeof mapRecentPatternCounts>
) => {
  const ordered = groups
    .filter((g) => Array.isArray(g.items) && g.items.length)
    .sort((a, b) => counts[a.key] - counts[b.key])
  return ordered[0]?.items || []
}

const parseRepRange = (raw: string): { min: number; max: number } | null => {
  const cleaned = String(raw || '').trim().replace(/–|—/g, '-')
  const parts = cleaned.split('-').map((p) => Number(p.trim()))
  if (parts.length >= 2) {
    const min = parts[0]
    const max = parts[1]
    if (Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min) return { min, max }
  }
  const single = Number(cleaned)
  if (Number.isFinite(single) && single > 0) return { min: single, max: single }
  return null
}

const formatRepRange = (min: number, max: number) => (min === max ? String(min) : `${min}-${max}`)

export const applyWizardConsistency = (
  rawAnswers: unknown,
  draft: WorkoutDraft,
  seed: number = 0,
  context?: WizardConsistencyContext
): WorkoutDraft => {
  const answers = normalizeAnswers(rawAnswers)
  const scheme = schemeFor(answers.goal, answers.level)
  const counts = countByTime(answers.timeMinutes)
  const recentCount14 = Number(context?.recentCount14 || 0)
  const adherenceLow = recentCount14 <= 1
  const adherenceHigh = recentCount14 >= 5
  const baseTarget = counts.main + (counts.core > 0 ? 1 : 0)
  const targetTotal = adherenceLow ? Math.max(3, baseTarget - 1) : adherenceHigh ? Math.min(baseTarget + 1, 10) : baseTarget
  const deload = Boolean(context?.deload)
  const finalTarget = deload ? Math.max(3, targetTotal - 1) : targetTotal
  const baseCatalog = catalog(answers.equipment)
  const kneeSensitive = isKneeSensitive(answers.constraints)
  const shoulderSensitive = isShoulderSensitive(answers.constraints)
  const pattern = resolvePrimaryPattern(answers.split, answers.focus)
  const coreList = baseCatalog.core || []
  const used = new Set<string>()
  const recentKeys = buildRecentKeys(context?.recentExercises)
  const recentPatternCounts = mapRecentPatternCounts(context?.recentExercises ? context.recentExercises : [], baseCatalog)

  const toCanonical = (raw: string) => {
    const info = resolveCanonicalExerciseName(raw)
    return info.canonical ? info.canonical : String(raw || '').trim()
  }

  const normalizeExercise = (raw: unknown, idx: number) => {
    const ex = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const nameRaw = String(ex?.name || '').trim()
    if (!nameRaw) return null
    let name = toCanonical(nameRaw)
    if (kneeSensitive && shouldSwapKnee(name)) name = pick(baseCatalog.hinge, idx, seed) || name
    if (shoulderSensitive && shouldSwapShoulder(name)) name = pick(baseCatalog.pull, idx, seed) || name
    let key = normalizeExerciseKey(name)
    if (recentKeys.has(key)) {
      const group = findCatalogGroup(name, baseCatalog)
      if (group) {
        const alt = pickAlternative(group, key, idx, seed)
        if (alt) {
          name = alt
          key = normalizeExerciseKey(name)
        }
      }
    }
    if (!key || used.has(key)) return null
    const restBounds = restBoundsForGoal(answers.goal)
    const setsRaw = Number(ex?.sets)
    const restRaw = Number(ex?.restTime ?? (ex as Record<string, unknown>)?.rest_time)
    let sets = clampNumber(Number.isFinite(setsRaw) && setsRaw > 0 ? setsRaw : scheme.sets, 2, Math.max(3, scheme.sets + 1))
    if (adherenceLow) sets = Math.max(2, sets - 1)
    if (adherenceHigh && answers.goal !== 'conditioning') sets = Math.min(sets + 1, scheme.sets + 2)
    if (deload) sets = Math.max(2, sets - 1)
    const restTime = clampNumber(Number.isFinite(restRaw) && restRaw > 0 ? restRaw : scheme.restTime, restBounds.min, restBounds.max)
    const target = context?.progressionTargets?.[key]
    const targetRange = target ? { min: target.min, max: target.max } : null
    const repsBase = targetRange ? formatRepRange(targetRange.min, targetRange.max) : normalizeReps(ex?.reps, scheme.reps)
    const stats = context?.recentExerciseStats?.[key]
    const parsedRange = parseRepRange(repsBase)
    let reps = repsBase
    if (parsedRange && stats && Number.isFinite(stats.avgReps) && stats.avgReps > 0) {
      const minCap = 3
      const maxCap = answers.goal === 'conditioning' ? 20 : 15
      if (adherenceHigh && stats.avgReps >= parsedRange.max) {
        const nextMin = clampNumber(parsedRange.min + 1, minCap, maxCap)
        const nextMax = clampNumber(parsedRange.max + 1, minCap, maxCap)
        reps = formatRepRange(nextMin, Math.max(nextMin, nextMax))
      } else if (adherenceLow && stats.avgReps <= parsedRange.min) {
        const nextMin = clampNumber(parsedRange.min - 1, minCap, maxCap)
        const nextMax = clampNumber(parsedRange.max - 1, minCap, maxCap)
        reps = formatRepRange(nextMin, Math.max(nextMin, nextMax))
      }
    }
    const notes = String(ex?.notes || '').trim()
    used.add(key)
    return { name, sets, reps, restTime, notes }
  }

  const normalized = Array.isArray(draft?.exercises)
    ? (draft.exercises.map((ex, idx) => normalizeExercise(ex, idx)).filter(Boolean) as Array<Record<string, unknown>>)
    : []

  const hasCore = normalized.some((ex) => isCoreExercise(String(ex?.name || ''), coreList))
  if (counts.core > 0 && !hasCore) {
    const coreName = pick(coreList, 0, seed)
    if (coreName) {
      const core = normalizeExercise({ name: coreName, sets: 3, reps: scheme.reps, restTime: Math.min(60, scheme.restTime) }, normalized.length)
      if (core) normalized.push(core)
    }
  }

  const addAccessory = (name: string | undefined, idx: number) => {
    if (!name) return
    const ex = normalizeExercise({ name, sets: Math.max(2, Math.min(3, scheme.sets)), reps: scheme.reps, restTime: Math.max(45, Math.min(90, scheme.restTime)) }, idx)
    if (ex) normalized.push(ex)
  }

  while (normalized.length < finalTarget) {
    const idx = normalized.length
    if (pattern === 'push') addAccessory(pick(baseCatalog.push, idx, seed), idx)
    else if (pattern === 'pull') addAccessory(pick(baseCatalog.pull, idx, seed), idx)
    else if (pattern === 'legs') addAccessory(pick(baseCatalog.legs, idx, seed), idx)
    else if (pattern === 'upper') {
      const group = pickLeastUsedGroup(
        [
          { key: 'push', items: baseCatalog.push },
          { key: 'pull', items: baseCatalog.pull },
        ],
        recentPatternCounts
      )
      addAccessory(pick(group, idx, seed), idx)
    } else if (pattern === 'lower') {
      const group = pickLeastUsedGroup(
        [
          { key: 'legs', items: baseCatalog.legs },
          { key: 'hinge', items: baseCatalog.hinge },
        ],
        recentPatternCounts
      )
      addAccessory(pick(group, idx, seed), idx)
    } else {
      const group = pickLeastUsedGroup(
        [
          { key: 'legs', items: baseCatalog.legs },
          { key: 'push', items: baseCatalog.push },
          { key: 'pull', items: baseCatalog.pull },
          { key: 'hinge', items: baseCatalog.hinge },
        ],
        recentPatternCounts
      )
      addAccessory(pick(group, idx, seed), idx)
    }
    if (normalized.length > 12) break
  }

  while (normalized.length > finalTarget && normalized.length > 1) {
    const last = normalized[normalized.length - 1]
    if (counts.core > 0 && isCoreExercise(String(last?.name || ''), coreList)) {
      const removed = normalized.splice(normalized.length - 2, 1)
      if (!removed.length) break
    } else {
      normalized.pop()
    }
  }

  const title = normalizeWorkoutTitle(draft?.title || 'Treino') || 'Treino'
  return { title, exercises: normalized }
}

export const buildProgressionTargets = (draft: WorkoutDraft) => {
  const exercises = Array.isArray(draft?.exercises) ? draft.exercises : []
  const result: Record<string, { min: number; max: number }> = {}
  exercises.forEach((raw) => {
    const ex = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
    const name = String(ex?.name || '').trim()
    if (!name) return
    const key = normalizeExerciseKey(name)
    const reps = parseRepRange(String(ex?.reps || ''))
    if (!key || !reps) return
    result[key] = { min: reps.min, max: reps.max }
  })
  return result
}

export function generateWorkoutFromWizard(answers: WorkoutWizardAnswers, seed: number = 0): WorkoutDraft {
  const safeAnswers = normalizeAnswers(answers)
  const scheme = schemeFor(safeAnswers.goal, safeAnswers.level)
  const counts = countByTime(safeAnswers.timeMinutes)
  const baseCatalog = catalog(safeAnswers.equipment)
  const kneeSensitive = isKneeSensitive(safeAnswers.constraints)
  const shoulderSensitive = isShoulderSensitive(safeAnswers.constraints)
  const pattern = resolvePrimaryPattern(safeAnswers.split, safeAnswers.focus)

  const pickPush = (i: number) => pick(baseCatalog.push, i, seed)
  const pickPull = (i: number) => pick(baseCatalog.pull, i, seed)
  const pickLegs = (i: number) => pick(baseCatalog.legs, i, seed)
  const pickHinge = (i: number) => pick(baseCatalog.hinge, i, seed)
  const pickCore = (i: number) => pick(baseCatalog.core, i, seed)

  const exercises: unknown[] = []

  const add = (name: string | undefined, overrides?: Partial<RepScheme>) => {
    const n = String(name || '').trim()
    if (!n) return
    const used = overrides ? { ...scheme, ...overrides } : scheme
    exercises.push({
      name: n,
      sets: used.sets,
      reps: used.reps,
      rpe: used.rpe,
      restTime: used.restTime,
      method: null,
      cadence: null,
      notes: null,
      setDetails: [],
    })
  }

  const addAccessory = (name: string | undefined) => add(name, { sets: Math.max(2, Math.min(3, scheme.sets)), restTime: Math.max(45, Math.min(90, scheme.restTime)) })

  if (pattern === 'push') {
    add(pickPush(0))
    add(shoulderSensitive ? pickPush(1) : pickPush(2))
    addAccessory(pickPush(3))
    addAccessory(pickPush(4))
  } else if (pattern === 'pull') {
    add(pickPull(0))
    add(pickPull(1))
    addAccessory(pickPull(3))
    addAccessory(pickPull(4))
  } else if (pattern === 'legs') {
    add(kneeSensitive ? pickHinge(0) : pickLegs(0))
    add(kneeSensitive ? pickHinge(2) : pickLegs(1))
    addAccessory(pickLegs(2))
    addAccessory(pickLegs(3))
  } else if (pattern === 'upper') {
    add(pickPush(0))
    add(pickPull(0))
    add(shoulderSensitive ? pickPull(1) : pickPush(2))
    addAccessory(pickPull(3))
  } else if (pattern === 'lower') {
    add(kneeSensitive ? pickHinge(0) : pickLegs(0))
    add(pickHinge(2))
    addAccessory(pickLegs(2))
    addAccessory(pickLegs(4))
  } else {
    add(kneeSensitive ? pickHinge(0) : pickLegs(0))
    add(pickPush(0))
    add(pickPull(0))
    addAccessory(pickHinge(2))
  }

  while (exercises.length < counts.main) {
    if (pattern === 'push') addAccessory(pickPush(exercises.length))
    else if (pattern === 'pull') addAccessory(pickPull(exercises.length))
    else if (pattern === 'legs') addAccessory(pickLegs(exercises.length))
    else if (pattern === 'upper') addAccessory(exercises.length % 2 === 0 ? pickPush(exercises.length) : pickPull(exercises.length))
    else if (pattern === 'lower') addAccessory(exercises.length % 2 === 0 ? pickLegs(exercises.length) : pickHinge(exercises.length))
    else addAccessory(exercises.length % 3 === 0 ? pickLegs(exercises.length) : exercises.length % 3 === 1 ? pickPush(exercises.length) : pickPull(exercises.length))
    if (exercises.length > 12) break
  }

  if (counts.core > 0) {
    addAccessory(pickCore(0))
  }

  if (answers.goal === 'conditioning') {
    for (const rawEx of exercises) {
      const ex = rawEx as { restTime?: number | string; reps?: string; rpe?: string | number }
      ex.restTime = Math.min(60, Math.max(30, Number(ex.restTime) || 45))
      ex.reps = ex.reps || '12-20'
      ex.rpe = ex.rpe || '6-8'
    }
  }

  const title = titleFor(safeAnswers.goal, safeAnswers.split, safeAnswers.focus)
  return applyWizardConsistency(safeAnswers, { title, exercises }, seed)
}

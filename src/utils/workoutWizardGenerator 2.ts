import type {
  WorkoutDraft,
  WorkoutWizardAnswers,
  WorkoutWizardEquipment,
  WorkoutWizardFocus,
  WorkoutWizardGoal,
  WorkoutWizardLevel,
  WorkoutWizardSplit,
} from '@/components/dashboard/WorkoutWizardModal'

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
  if (!list.length) return undefined as any
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

export function generateWorkoutFromWizard(answers: WorkoutWizardAnswers, seed: number = 0): WorkoutDraft {
  const scheme = schemeFor(answers.goal, answers.level)
  const counts = countByTime(answers.timeMinutes)
  const baseCatalog = catalog(answers.equipment)
  const kneeSensitive = isKneeSensitive(answers.constraints)
  const shoulderSensitive = isShoulderSensitive(answers.constraints)
  const pattern = resolvePrimaryPattern(answers.split, answers.focus)

  const pickPush = (i: number) => pick(baseCatalog.push, i, seed)
  const pickPull = (i: number) => pick(baseCatalog.pull, i, seed)
  const pickLegs = (i: number) => pick(baseCatalog.legs, i, seed)
  const pickHinge = (i: number) => pick(baseCatalog.hinge, i, seed)
  const pickCore = (i: number) => pick(baseCatalog.core, i, seed)

  const exercises: any[] = []

  const add = (name: string, overrides?: Partial<RepScheme>) => {
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

  const addAccessory = (name: string) => add(name, { sets: Math.max(2, Math.min(3, scheme.sets)), restTime: Math.max(45, Math.min(90, scheme.restTime)) })

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
    for (const ex of exercises) {
      ex.restTime = Math.min(60, Math.max(30, Number(ex.restTime) || 45))
      ex.reps = ex.reps || '12-20'
      ex.rpe = ex.rpe || '6-8'
    }
  }

  const title = titleFor(answers.goal, answers.split, answers.focus)
  return { title, exercises }
}

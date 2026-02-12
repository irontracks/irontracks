
export type WizardExercise = {
  name: string
  sets: number
  reps: string
  restTime: number
  rpe: number | null
  method?: string | null
  cadence?: string | null
  notes?: string | null
  setDetails?: any[]
  raw?: any
}

export type WizardDraft = {
  title: string
  exercises: WizardExercise[]
  constraintsApplied?: string[]
  rejectedItems?: string[]
}

export type ConstraintFlags = {
  shoulderSensitive: boolean
  machinePriority: boolean
  noBarbell: boolean
  avoidOverhead: boolean
  normalized: string
}

export type ValidationResult = {
  ok: boolean
  errors: string[]
  normalized: WizardDraft
  flags: ConstraintFlags
}

const normalizeText = (v: any): string =>
  String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export const detectFlagsFromConstraints = (constraints: string): ConstraintFlags => {
  const t = normalizeText(constraints)
  const shoulderSensitive =
    t.includes('ombro') ||
    t.includes('manguito') ||
    t.includes('supraespinhal') ||
    t.includes('impingement') ||
    t.includes('bursite')

  const machinePriority =
    t.includes('maquina') ||
    t.includes('máquina') ||
    t.includes('smart fit') ||
    t.includes('smartfit') ||
    t.includes('cable') ||
    t.includes('polia') ||
    t.includes('crossover')

  const noBarbell =
    t.includes('sem barra') ||
    t.includes('evitar barra') ||
    t.includes('nao usar barra') ||
    t.includes('não usar barra')

  const avoidOverhead =
    t.includes('evitar overhead') ||
    t.includes('sem overhead') ||
    t.includes('nao overhead') ||
    t.includes('não overhead') ||
    t.includes('pressao ombro')

  return { shoulderSensitive, machinePriority, noBarbell, avoidOverhead, normalized: t }
}

const parseNumericOrNull = (v: any): number | null => {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const raw = String(v).trim()
  if (!raw) return null
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const parseRangeAverageOrNull = (v: any): number | null => {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const raw = String(v).trim()
  if (!raw) return null
  const cleaned = raw.replace(',', '.')
  
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-').map((x) => x.trim()).filter(Boolean)
    if (parts.length === 2) {
      const a = parseNumericOrNull(parts[0])
      const b = parseNumericOrNull(parts[1])
      if (a != null && b != null) {
        const avg = (a + b) / 2
        return Number.isFinite(avg) ? avg : null
      }
    }
  }
  
  return parseNumericOrNull(cleaned)
}

const extractExercises = (draft: any): WizardExercise[] => {
  const d = draft && typeof draft === 'object' ? draft : {}
  const raw = Array.isArray(d.exercises) ? d.exercises : []
  
  return raw
    .map((ex: any): WizardExercise | null => {
      const e = ex && typeof ex === 'object' ? ex : {}
      const name = String(e.name || '').trim()
      if (!name) return null
      
      const sets = Number(e.sets)
      const restTime = Number(e.restTime)
      const reps = String(e.reps || '').trim()
      const rpe = parseRangeAverageOrNull(e.rpe)
      
      // Basic validation to filter out garbage
      if (!reps && !sets) return null

      return { 
        name, 
        sets: Number.isFinite(sets) ? sets : 3,
        restTime: Number.isFinite(restTime) ? restTime : 60,
        reps: reps || '8-12', 
        rpe,
        method: e.method,
        cadence: e.cadence,
        notes: e.notes,
        raw: e 
      }
    })
    .filter((e: WizardExercise | null): e is WizardExercise => e !== null)
}

export const normalizeDraft = (draft: any): WizardDraft => {
  const d = draft && typeof draft === 'object' ? draft : {}
  const title = String(d.title || '').trim() || 'Treino'
  
  const exercises = extractExercises(draft).map((e) => ({
    ...e,
    sets: Math.max(1, Math.min(10, Math.round(e.sets))),
    restTime: Math.max(15, Math.min(600, Math.round(e.restTime))),
    rpe: e.rpe == null ? null : Math.max(0, Math.min(10, e.rpe)),
  }))

  const constraintsApplied = Array.isArray(d?.constraintsApplied) 
    ? d.constraintsApplied.map((x: any) => String(x || '').trim()).filter(Boolean) 
    : []
    
  const rejectedItems = Array.isArray(d?.rejectedItems) 
    ? d.rejectedItems.map((x: any) => String(x || '').trim()).filter(Boolean) 
    : []

  return { title, exercises, constraintsApplied, rejectedItems }
}

const hasAnyMatch = (name: string, patterns: string[]): boolean => {
  const t = normalizeText(name)
  return patterns.some((p) => t.includes(p))
}

export const machineScore = (exerciseNames: string[]): number => {
  const machineHints = [
    'maquina', 'máquina', 'polia', 'crossover', 'cable', 'smith',
    'leg press', 'cadeira', 'extensora', 'flexora', 'hack',
    'peck', 'remada baixa', 'puxada', 'pulldown', 'press',
    'panturrilha em pe', 'sentado', 'articulado'
  ]
  const list = Array.isArray(exerciseNames) ? exerciseNames : []
  if (!list.length) return 0
  
  const hit = list.filter((n) => hasAnyMatch(n, machineHints)).length
  return hit / list.length
}

export const validateDraftAgainstConstraints = (draft: any, constraintsText: string): ValidationResult => {
  const normalized = normalizeDraft(draft)
  const exNames = normalized.exercises.map((e) => e.name)
  const flags = detectFlagsFromConstraints(constraintsText)
  const errors: string[] = []

  if (!normalized.exercises.length) {
    errors.push('Sem exercícios.')
  }

  normalized.exercises.forEach((e) => {
    if (!e.name) errors.push('Exercício sem nome.')
    // Further granular validation if needed
  })

  if (flags.shoulderSensitive || flags.avoidOverhead) {
    const forbidden = [
      'desenvolvimento', 'militar', 'overhead', 'push press',
      'arnold', 'dips', 'paralelas', 'remada alta',
      'upright row', 'snatch', 'triceps frances'
    ]
    const violating = exNames.filter((n) => hasAnyMatch(n, forbidden))
    if (violating.length) {
      errors.push(`Restrições de ombro/overhead violadas: ${violating.slice(0, 3).join(', ')}.`)
    }
  }

  if (flags.noBarbell) {
    const forbidden = [
      'barra', 'barbell', 'supino reto', 'supino inclinado',
      'agachamento livre', 'terra', 'levantamento terra', 'remada curvada'
    ]
    const violating = exNames.filter((n) => hasAnyMatch(n, forbidden))
    if (violating.length) {
      errors.push(`Restrições "sem barra" violadas: ${violating.slice(0, 3).join(', ')}.`)
    }
  }

  if (flags.machinePriority) {
    const score = machineScore(exNames)
    // Relaxed threshold: if user wants machines, at least 40% should be clearly machines
    if (score < 0.4) {
      // Don't fail hard, just warn or maybe fail if strict
      // errors.push(`Poucas máquinas identificadas (${(score * 100).toFixed(0)}%).`)
    }
  }

  return { ok: errors.length === 0, errors, normalized, flags }
}

export const similarityByNames = (aDraft: any, bDraft: any): number => {
  const a = normalizeDraft(aDraft)
  const b = normalizeDraft(bDraft)
  
  const aSet = new Set(a.exercises.map((e) => normalizeText(e.name)).filter(Boolean))
  const bSet = new Set(b.exercises.map((e) => normalizeText(e.name)).filter(Boolean))
  
  const inter = Array.from(aSet).filter((x) => bSet.has(x)).length
  const union = new Set([...aSet, ...bSet]).size
  
  if (!union) return 1 // Both empty?
  return inter / union
}

const normalizeText = (v) =>
  String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const detectFlagsFromConstraints = (constraints) => {
  const t = normalizeText(constraints)
  const shoulderSensitive = t.includes('ombro') || t.includes('manguito') || t.includes('supraespinhal') || t.includes('impingement')
  const machinePriority =
    t.includes('maquina') ||
    t.includes('máquina') ||
    t.includes('smart fit') ||
    t.includes('smartfit') ||
    t.includes('cable') ||
    t.includes('polia') ||
    t.includes('crossover')
  const noBarbell = t.includes('sem barra') || t.includes('evitar barra') || t.includes('nao usar barra') || t.includes('não usar barra')
  const avoidOverhead = t.includes('evitar overhead') || t.includes('sem overhead') || t.includes('nao overhead') || t.includes('não overhead')
  return { shoulderSensitive, machinePriority, noBarbell, avoidOverhead, normalized: t }
}

const parseNumericOrNull = (v) => {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const raw = String(v).trim()
  if (!raw) return null
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const parseRangeAverageOrNull = (v) => {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const raw = String(v).trim()
  if (!raw) return null
  const cleaned = raw.replace(',', '.')
  const parts = cleaned.split('-').map((x) => x.trim()).filter(Boolean)
  if (parts.length === 2) {
    const a = parseNumericOrNull(parts[0])
    const b = parseNumericOrNull(parts[1])
    if (a == null || b == null) return null
    const avg = (a + b) / 2
    return Number.isFinite(avg) ? avg : null
  }
  return parseNumericOrNull(cleaned)
}

const extractExercises = (draft) => {
  const d = draft && typeof draft === 'object' ? draft : {}
  const raw = Array.isArray(d.exercises) ? d.exercises : []
  return raw
    .map((ex) => {
      const e = ex && typeof ex === 'object' ? ex : {}
      const name = String(e.name || '').trim()
      if (!name) return null
      const sets = Number(e.sets)
      const restTime = Number(e.restTime)
      const reps = String(e.reps || '').trim()
      const rpe = parseRangeAverageOrNull(e.rpe)
      return { name, sets, restTime, reps, rpe, raw: e }
    })
    .filter(Boolean)
}

const normalizeDraft = (draft) => {
  const d = draft && typeof draft === 'object' ? draft : {}
  const title = String(d.title || '').trim() || 'Treino'
  const exercises = extractExercises(draft).map((e) => ({
    name: e.name,
    sets: Number.isFinite(e.sets) ? Math.max(1, Math.min(8, Math.round(e.sets))) : 3,
    reps: e.reps || '8-12',
    restTime: Number.isFinite(e.restTime) ? Math.max(15, Math.min(300, Math.round(e.restTime))) : 75,
    rpe: e.rpe == null ? null : Math.max(0, Math.min(10, e.rpe)),
    method: d?.method ?? null,
    cadence: d?.cadence ?? null,
    notes: d?.notes ?? null,
    setDetails: Array.isArray(d?.setDetails) ? d.setDetails : [],
  }))
  const constraintsApplied = Array.isArray(d?.constraintsApplied) ? d.constraintsApplied.map((x) => String(x || '').trim()).filter(Boolean) : []
  const rejectedItems = Array.isArray(d?.rejectedItems) ? d.rejectedItems.map((x) => String(x || '').trim()).filter(Boolean) : []
  return { title, exercises, constraintsApplied, rejectedItems }
}

const hasAnyMatch = (name, patterns) => {
  const t = normalizeText(name)
  return patterns.some((p) => t.includes(p))
}

const machineScore = (exerciseNames) => {
  const machineHints = [
    'maquina',
    'máquina',
    'polia',
    'crossover',
    'cable',
    'smith',
    'leg press',
    'cadeira',
    'extensora',
    'flexora',
    'hack',
    'peck',
    'remada baixa',
    'puxada',
    'pulldown',
    'press',
    'panturrilha em pe',
  ]
  const list = Array.isArray(exerciseNames) ? exerciseNames : []
  if (!list.length) return 0
  const hit = list.filter((n) => hasAnyMatch(n, machineHints)).length
  return hit / list.length
}

const validateDraftAgainstConstraints = (draft, constraintsText) => {
  const normalized = normalizeDraft(draft)
  const exNames = normalized.exercises.map((e) => e.name)
  const flags = detectFlagsFromConstraints(constraintsText)
  const errors = []

  if (!normalized.exercises.length) errors.push('Sem exercícios.')

  normalized.exercises.forEach((e) => {
    if (!e.name) errors.push('Exercício sem nome.')
    if (!Number.isFinite(e.sets) || e.sets <= 0) errors.push(`Sets inválidos em ${e.name || 'exercício'}.`)
    if (!String(e.reps || '').trim()) errors.push(`Reps inválidas em ${e.name || 'exercício'}.`)
    if (!Number.isFinite(e.restTime) || e.restTime <= 0) errors.push(`Descanso inválido em ${e.name || 'exercício'}.`)
    if (e.rpe != null && (!Number.isFinite(e.rpe) || e.rpe <= 0 || e.rpe > 10)) errors.push(`RPE inválido em ${e.name || 'exercício'}.`)
  })

  if (flags.shoulderSensitive || flags.avoidOverhead) {
    const forbidden = [
      'desenvolvimento',
      'militar',
      'overhead',
      'push press',
      'arnold',
      'dips',
      'paralelas',
      'remada alta',
      'upright row',
      'snatch',
    ]
    const violating = exNames.filter((n) => hasAnyMatch(n, forbidden))
    if (violating.length) {
      errors.push(`Restrições de ombro/overhead violadas: ${violating.slice(0, 4).join(', ')}.`)
    }
  }

  if (flags.noBarbell) {
    const forbidden = ['barra', 'barbell', 'supino reto', 'supino inclinado', 'agachamento livre', 'terra', 'levantamento terra', 'remada curvada']
    const violating = exNames.filter((n) => hasAnyMatch(n, forbidden))
    if (violating.length) {
      errors.push(`Restrições \"sem barra\" violadas: ${violating.slice(0, 4).join(', ')}.`)
    }
  }

  if (flags.machinePriority) {
    const score = machineScore(exNames)
    if (score < 0.6) errors.push(`Poucas máquinas/cabos para a preferência: score ${(score * 100).toFixed(0)}%.`)
  }

  return { ok: errors.length === 0, errors, normalized, flags }
}

const similarityByNames = (aDraft, bDraft) => {
  const a = normalizeDraft(aDraft)
  const b = normalizeDraft(bDraft)
  const aSet = new Set(a.exercises.map((e) => normalizeText(e.name)).filter(Boolean))
  const bSet = new Set(b.exercises.map((e) => normalizeText(e.name)).filter(Boolean))
  const inter = Array.from(aSet).filter((x) => bSet.has(x)).length
  const union = new Set([...aSet, ...bSet]).size
  if (!union) return 1
  return inter / union
}

module.exports = {
  normalizeText,
  detectFlagsFromConstraints,
  normalizeDraft,
  validateDraftAgainstConstraints,
  similarityByNames,
  machineScore,
}

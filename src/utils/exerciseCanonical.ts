import { normalizeExerciseName } from '@/utils/normalizeExerciseName'

const titleCase = (value: string) => {
  const s = String(value || '').trim()
  if (!s) return ''
  return s
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const ALIASES: Record<string, string> = {
  'bench press': 'Supino reto',
  'barbell bench press': 'Supino reto',
  'supino reto': 'Supino reto',
  'supino barra': 'Supino reto',
  'supino com barra': 'Supino reto',
  'supino reto com barra': 'Supino reto',
  'supino halter reto': 'Supino reto com halteres',
  'supino reto halteres': 'Supino reto com halteres',
  'dumbbell bench press': 'Supino reto com halteres',
  'pull up': 'Barra fixa',
  'chin up': 'Barra fixa',
  'barra fixa': 'Barra fixa',
  'lat pulldown': 'Puxada alta',
  'puxada na polia': 'Puxada alta',
  'puxada alta': 'Puxada alta',
  'leg press': 'Leg press',
  'agachamento livre': 'Agachamento livre',
  'squat': 'Agachamento livre',
  'romanian deadlift': 'Terra romeno',
  'rdl': 'Terra romeno',
  'deadlift': 'Levantamento terra',
  'shoulder press': 'Desenvolvimento',
  'overhead press': 'Desenvolvimento',
  'military press': 'Desenvolvimento',
  'desenvolvimento militar': 'Desenvolvimento',
  'facepull': 'Face pull',
  'face pull': 'Face pull',
}

export type CanonicalExerciseResult = {
  original: string
  normalized: string
  canonical: string
  changed: boolean
  source: 'alias' | 'none'
}

export const resolveCanonicalExerciseName = (input: string): CanonicalExerciseResult => {
  const original = String(input || '').trim()
  const normalized = normalizeExerciseName(original)
  if (!normalized) {
    return { original, normalized, canonical: '', changed: false, source: 'none' }
  }
  const canonicalRaw = ALIASES[normalized]
  const canonical = canonicalRaw ? String(canonicalRaw) : titleCase(original)
  const changed = canonicalRaw ? canonical !== original : false
  return { original, normalized, canonical, changed, source: canonicalRaw ? 'alias' : 'none' }
}


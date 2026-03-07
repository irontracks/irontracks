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
  'supino inclinado': 'Supino inclinado',
  'supino inclinado halteres': 'Supino inclinado com halteres',
  'supino inclinado com halteres': 'Supino inclinado com halteres',
  'incline dumbbell press': 'Supino inclinado com halteres',
  'incline bench press': 'Supino inclinado',
  'desenvolvimento com halteres': 'Desenvolvimento com halteres',
  'desenvolvimento militar com halteres': 'Desenvolvimento com halteres',
  'shoulder press dumbbell': 'Desenvolvimento com halteres',
  'pull up': 'Barra fixa',
  'chin up': 'Barra fixa',
  'barra fixa': 'Barra fixa',
  'puxada alta frente': 'Puxada alta',
  'puxada frente': 'Puxada alta',
  'lat pulldown': 'Puxada alta',
  'puxada na polia': 'Puxada alta',
  'puxada alta': 'Puxada alta',
  'remada cavalinho': 'Remada curvada',
  'remada baixa triangulo': 'Remada baixa',
  'remada baixa triângulo': 'Remada baixa',
  'leg press': 'Leg press',
  'agachamento livre': 'Agachamento livre',
  'squat': 'Agachamento livre',
  'agachamento smith': 'Agachamento livre',
  'agachamento no smith': 'Agachamento livre',
  'agachamento hack': 'Agachamento livre',
  'agachamento hack machine': 'Agachamento livre',
  'stiff': 'Stiff',
  'romanian deadlift': 'Terra romeno',
  'rdl': 'Terra romeno',
  'deadlift': 'Levantamento terra',
  'terra romeno': 'Terra romeno',
  'levantamento terra romeno': 'Terra romeno',
  'shoulder press': 'Desenvolvimento',
  'overhead press': 'Desenvolvimento',
  'military press': 'Desenvolvimento',
  'desenvolvimento militar': 'Desenvolvimento',
  'cadeira extensora': 'Cadeira extensora',
  'extensora': 'Cadeira extensora',
  'mesa flexora': 'Cadeira flexora',
  'flexora': 'Cadeira flexora',
  'facepull': 'Face pull',
  'face pull': 'Face pull',
  'panturrilha sentada': 'Elevação de panturrilha sentada',
  'panturrilha sentado': 'Elevação de panturrilha sentada',
  'elevacao de panturrilha sentada': 'Elevação de panturrilha sentada',
  'elevacao panturrilha sentada': 'Elevação de panturrilha sentada',
  'soleo sentado': 'Elevação de panturrilha sentada',
  'seated calf raise': 'Elevação de panturrilha sentada',
  'calf raise': 'Elevação de panturrilha',
  'standing calf raise': 'Elevação de panturrilha em pé',
  'panturrilha no leg press': 'Elevação de panturrilha no leg press',
  'calf press': 'Elevação de panturrilha no leg press',
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

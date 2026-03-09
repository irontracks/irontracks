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
  // ── SUPINO ──────────────────────────────────────────────────────────
  'bench press': 'Supino reto',
  'barbell bench press': 'Supino reto',
  'supino reto': 'Supino reto',
  'supino barra': 'Supino reto',
  'supino com barra': 'Supino reto',
  'supino reto com barra': 'Supino reto',
  'supino reto barra': 'Supino reto',
  // Wizard: "Supino Reto - Máquina Articulada"
  'supino reto maquina articulada': 'Supino reto',
  'supino reto maquina': 'Supino reto',
  'supino maquina': 'Supino reto',
  'supino maquina articulada': 'Supino reto',
  'supino articulado': 'Supino reto',
  'supino halter reto': 'Supino reto com halteres',
  'supino reto halteres': 'Supino reto com halteres',
  'supino reto halter': 'Supino reto com halteres',
  'dumbbell bench press': 'Supino reto com halteres',
  'supino inclinado': 'Supino inclinado',
  'supino inclinado halteres': 'Supino inclinado com halteres',
  'supino inclinado com halteres': 'Supino inclinado com halteres',
  'supino inclinado halter': 'Supino inclinado com halteres',
  'supino inclinado maquina': 'Supino inclinado',
  'supino inclinado maquina articulada': 'Supino inclinado',
  'incline dumbbell press': 'Supino inclinado com halteres',
  'incline bench press': 'Supino inclinado',
  'supino declinado': 'Supino declinado',
  'supino declinado halteres': 'Supino declinado com halteres',
  'supino declinado halter': 'Supino declinado com halteres',
  // ── CRUCIFIXO / FLY ─────────────────────────────────────────────────
  // Wizard: "Crucifixo - Peck Deck"
  'crucifixo peck deck': 'Crucifixo',
  'crucifixo pec deck': 'Crucifixo',
  'crucifixo maquina': 'Crucifixo',
  'crucifixo': 'Crucifixo',
  'peck deck': 'Crucifixo',
  'pec deck': 'Crucifixo',
  'fly': 'Crucifixo',
  'chest fly': 'Crucifixo',
  'voador peitoral': 'Crucifixo',
  // ── CROSSOVER ────────────────────────────────────────────────────────
  // Wizard: "Cross Over Médio"
  'cross over medio': 'Crossover',
  'cross over baixo': 'Crossover baixo',
  'cross over alto': 'Crossover alto',
  'crossover medio': 'Crossover',
  'crossover baixo': 'Crossover baixo',
  'crossover alto': 'Crossover alto',
  'crossover': 'Crossover',
  'cable fly': 'Crossover',
  'cable crossover': 'Crossover',
  // ── DESENVOLVIMENTO / PRESS OMBRO ────────────────────────────────────
  // Wizard: "Desenvolvimento - Máquina Articulada"
  'desenvolvimento maquina articulada': 'Desenvolvimento',
  'desenvolvimento maquina': 'Desenvolvimento',
  'desenvolvimento com halteres': 'Desenvolvimento com halteres',
  'desenvolvimento militar com halteres': 'Desenvolvimento com halteres',
  'shoulder press dumbbell': 'Desenvolvimento com halteres',
  'desenvolvimento halter': 'Desenvolvimento com halteres',
  'shoulder press': 'Desenvolvimento',
  'overhead press': 'Desenvolvimento',
  'military press': 'Desenvolvimento',
  'desenvolvimento militar': 'Desenvolvimento',
  'press militar': 'Desenvolvimento',
  'desenvolvimento': 'Desenvolvimento',
  'arnold press': 'Arnold press',
  // ── ELEVAÇÃO LATERAL ─────────────────────────────────────────────────
  // Wizard: "Elevação Lateral - Halter"
  'elevacao lateral halter': 'Elevação lateral',
  'elevação lateral halter': 'Elevação lateral',
  'elevacao lateral halteres': 'Elevação lateral',
  'elevação lateral halteres': 'Elevação lateral',
  'elevacao lateral': 'Elevação lateral',
  'elevação lateral': 'Elevação lateral',
  'elevacao lateral polia': 'Elevação lateral',
  'elevação lateral polia': 'Elevação lateral',
  'lateral raise': 'Elevação lateral',
  'side raise': 'Elevação lateral',
  // ── ELEVAÇÃO FRONTAL ─────────────────────────────────────────────────
  // Wizard: "Elevação Frontal - Halter"
  'elevacao frontal halter': 'Elevação frontal',
  'elevação frontal halter': 'Elevação frontal',
  'elevacao frontal halteres': 'Elevação frontal',
  'elevação frontal halteres': 'Elevação frontal',
  'elevacao frontal': 'Elevação frontal',
  'elevação frontal': 'Elevação frontal',
  'front raise': 'Elevação frontal',
  // ── PUXADA / COSTAS ──────────────────────────────────────────────────
  'pull up': 'Barra fixa',
  'chin up': 'Barra fixa',
  'barra fixa': 'Barra fixa',
  'puxada alta frente': 'Puxada alta',
  'puxada frente': 'Puxada alta',
  'lat pulldown': 'Puxada alta',
  'puxada na polia': 'Puxada alta',
  'puxada alta': 'Puxada alta',
  'puxada alta maquina': 'Puxada alta',
  'puxada alta polia': 'Puxada alta',
  'puxada supinada': 'Puxada supinada',
  'remada cavalinho': 'Remada curvada',
  'remada curvada': 'Remada curvada',
  'remada baixa triangulo': 'Remada baixa',
  'remada baixa triângulo': 'Remada baixa',
  'remada baixa': 'Remada baixa',
  'remada serrote': 'Remada serrote',
  'remada unilateral': 'Remada serrote',
  'seated row': 'Remada baixa',
  // ── BÍCEPS ───────────────────────────────────────────────────────────
  'rosca direta': 'Rosca direta',
  'rosca direta barra': 'Rosca direta',
  'rosca direta halteres': 'Rosca alternada',
  'rosca alternada': 'Rosca alternada',
  'rosca scott': 'Rosca scott',
  'scott': 'Rosca scott',
  'rosca martelo': 'Rosca martelo',
  'hammer curl': 'Rosca martelo',
  'rosca concentrada': 'Rosca concentrada',
  'rosca polia': 'Rosca polia',
  'curl': 'Rosca direta',
  // ── TRÍCEPS ──────────────────────────────────────────────────────────
  'triceps pulley': 'Tríceps pulley',
  'triceps polia': 'Tríceps pulley',
  'triceps corda': 'Tríceps corda',
  'pushdown corda': 'Tríceps corda',
  'triceps frances': 'Tríceps francês',
  'triceps testa': 'Tríceps testa',
  'skull crusher': 'Tríceps testa',
  'triceps coice': 'Tríceps coice',
  'triceps kickback': 'Tríceps coice',
  'mergulho': 'Mergulho',
  'dip': 'Mergulho',
  // ── QUADRÍCEPS ───────────────────────────────────────────────────────
  'leg press': 'Leg press',
  'leg press inclinado': 'Leg press',
  'agachamento livre': 'Agachamento livre',
  'squat': 'Agachamento livre',
  'agachamento smith': 'Agachamento no Smith',
  'agachamento no smith': 'Agachamento no Smith',
  'agachamento hack': 'Agachamento hack',
  'agachamento hack machine': 'Agachamento hack',
  'hack squat': 'Agachamento hack',
  'cadeira extensora': 'Cadeira extensora',
  'extensora': 'Cadeira extensora',
  // ── POSTERIOR / FEMORAL ──────────────────────────────────────────────
  'stiff': 'Stiff',
  'romanian deadlift': 'Terra romeno',
  'rdl': 'Terra romeno',
  'deadlift': 'Levantamento terra',
  'terra romeno': 'Terra romeno',
  'levantamento terra romeno': 'Terra romeno',
  'mesa flexora': 'Cadeira flexora',
  'cadeira flexora': 'Cadeira flexora',
  'flexora': 'Cadeira flexora',
  'leg curl': 'Cadeira flexora',
  'leg curl deitado': 'Cadeira flexora',
  // ── GLÚTEOS ──────────────────────────────────────────────────────────
  'hip thrust': 'Hip thrust',
  'passada': 'Passada',
  'lunge': 'Passada',
  'avanco': 'Passada',
  'avanço': 'Passada',
  'abdutora': 'Abdutora',
  'abducao quadril': 'Abdução de quadril',
  'abdução quadril': 'Abdução de quadril',
  // ── OMBRO POSTERIOR ──────────────────────────────────────────────────
  'facepull': 'Face pull',
  'face pull': 'Face pull',
  'crucifixo invertido': 'Crucifixo invertido',
  'voador invertido': 'Crucifixo invertido',
  'reverse fly': 'Crucifixo invertido',
  'encolhimento': 'Encolhimento de ombros',
  'shrug': 'Encolhimento de ombros',
  // ── PANTURRILHA ──────────────────────────────────────────────────────
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

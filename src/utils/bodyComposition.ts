/* ─────────────────────────────────────────────────────────
 * Body Composition Estimation
 *
 * Uses Navy/YMCA formulas enhanced with correction factors
 * to estimate body fat percentage from basic measurements.
 *
 * Feature 8: AI Body Composition
 * ───────────────────────────────────────────────────────── */

interface Measurements {
  weight: number      // kg
  height: number      // cm
  waist: number       // cm (circunferência cintura)
  hip?: number        // cm (circunferência quadril, required for female)
  neck?: number       // cm (circunferência pescoço)
  gender: 'male' | 'female'
  age?: number
}

interface BodyCompResult {
  bodyFatPercent: number
  fatMassKg: number
  leanMassKg: number
  bmi: number
  category: string
  description: string
  method: string
}

/**
 * US Navy formula
 * Men: %BF = 86.010 × log10(waist - neck) - 70.041 × log10(height) + 36.76
 * Women: %BF = 163.205 × log10(waist + hip - neck) - 97.684 × log10(height) - 78.387
 */
function navyFormula(m: Measurements): number | null {
  const neck = m.neck || (m.gender === 'male' ? m.waist * 0.38 : m.waist * 0.35) // estimate if missing
  if (m.gender === 'male') {
    const diff = m.waist - neck
    if (diff <= 0) return null
    return 86.010 * Math.log10(diff) - 70.041 * Math.log10(m.height) + 36.76
  } else {
    const hip = m.hip || m.waist * 1.1 // rough estimate if missing
    const sum = m.waist + hip - neck
    if (sum <= 0) return null
    return 163.205 * Math.log10(sum) - 97.684 * Math.log10(m.height) - 78.387
  }
}

/**
 * YMCA formula (simpler, waist-only)
 * Men: %BF = (-98.42 + 4.15 × waist_in - 0.082 × weight_lb) / weight_lb × 100
 * Women: %BF = (-76.76 + 4.15 × waist_in - 0.082 × weight_lb) / weight_lb × 100
 */
function ymcaFormula(m: Measurements): number | null {
  const waistIn = m.waist / 2.54
  const weightLb = m.weight * 2.2046
  if (weightLb <= 0) return null
  const constant = m.gender === 'male' ? -98.42 : -76.76
  const fatLb = constant + 4.15 * waistIn - 0.082 * weightLb
  const bf = (fatLb / weightLb) * 100
  return bf
}

function getCategory(bf: number, gender: 'male' | 'female'): { category: string; description: string } {
  if (gender === 'male') {
    if (bf <= 6) return { category: 'Essencial', description: 'Gordura corporal no nível essencial. Cuidado com saúde.' }
    if (bf <= 13) return { category: 'Atlético', description: 'Excelente composição corporal atlética.' }
    if (bf <= 17) return { category: 'Fitness', description: 'Boa forma física, composição saudável.' }
    if (bf <= 24) return { category: 'Médio', description: 'Composição corporal na faixa média.' }
    return { category: 'Acima da Média', description: 'Acima da faixa ideal. Considere ajustar nutrição.' }
  } else {
    if (bf <= 14) return { category: 'Essencial', description: 'Gordura corporal no nível essencial. Cuidado com saúde.' }
    if (bf <= 20) return { category: 'Atlético', description: 'Excelente composição corporal atlética.' }
    if (bf <= 24) return { category: 'Fitness', description: 'Boa forma física, composição saudável.' }
    if (bf <= 31) return { category: 'Médio', description: 'Composição corporal na faixa média.' }
    return { category: 'Acima da Média', description: 'Acima da faixa ideal. Considere ajustar nutrição.' }
  }
}

export function estimateBodyComposition(measurements: Measurements): BodyCompResult | null {
  const m = measurements
  if (!m.weight || !m.height || !m.waist) return null

  const navy = navyFormula(m)
  const ymca = ymcaFormula(m)

  // Weighted average if both available
  let bodyFat: number
  let method: string

  if (navy !== null && ymca !== null) {
    bodyFat = navy * 0.6 + ymca * 0.4 // Navy is more accurate with more measurements
    method = 'Navy + YMCA (média ponderada)'
  } else if (navy !== null) {
    bodyFat = navy
    method = 'Navy'
  } else if (ymca !== null) {
    bodyFat = ymca
    method = 'YMCA'
  } else {
    return null
  }

  // Age correction (older = slightly higher BF for same measurements)
  if (m.age && m.age > 30) {
    bodyFat += (m.age - 30) * 0.1
  }

  // Clamp to reasonable range
  bodyFat = Math.max(3, Math.min(55, bodyFat))
  bodyFat = Math.round(bodyFat * 10) / 10

  const fatMassKg = Math.round((m.weight * bodyFat / 100) * 10) / 10
  const leanMassKg = Math.round((m.weight - fatMassKg) * 10) / 10
  const bmi = Math.round(m.weight / Math.pow(m.height / 100, 2) * 10) / 10

  const { category, description } = getCategory(bodyFat, m.gender)

  return {
    bodyFatPercent: bodyFat,
    fatMassKg,
    leanMassKg,
    bmi,
    category,
    description,
    method,
  }
}

/**
 * Ajuste de meta calórica para dias de descanso — função PURA (sem servidor).
 *
 * Ideia: a meta diária do app já embute o gasto dos treinos no multiplicador de
 * atividade (TDEE), espalhado pela semana. Num dia de descanso puro o gasto real
 * é menor, então descontamos ~1 treino da meta. A proteína NUNCA cai (preserva
 * massa magra); o corte sai de carboidrato e gordura, proporcional ao que cada
 * um representa. Travas de segurança impedem que a meta fique baixa demais.
 */
export interface MacroGoals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface RestDayAdjustment extends MacroGoals {
  /** Quanto foi descontado da meta (kcal). 0 = sem mudança. */
  reduction: number
}

const CALORIES_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const

// Travas de segurança (saúde em primeiro lugar).
const MAX_REDUCTION_KCAL = 500 // teto do desconto por dia
const MIN_REDUCTION_KCAL = 50 // abaixo disso não vale mexer (ruído)
const ABSOLUTE_FLOOR_KCAL = 1200 // meta nunca desce abaixo disso
const MAX_CUT_FRACTION = 0.25 // nunca cortar mais que 25% da meta

/**
 * Calcula a meta ajustada para um dia de descanso, descontando o gasto médio de
 * um treino (`avgWorkoutKcal`). Retorna a meta original inalterada (reduction 0)
 * quando o desconto seria irrelevante ou os dados são inválidos.
 */
export function computeRestDayAdjustment(base: MacroGoals, avgWorkoutKcal: number): RestDayAdjustment {
  const calories = Number(base?.calories)
  const protein = Number(base?.protein)
  const carbs = Number(base?.carbs)
  const fat = Number(base?.fat)
  const avg = Number(avgWorkoutKcal)

  const unchanged: RestDayAdjustment = {
    calories: Math.max(0, Math.round(calories) || 0),
    protein: Math.max(0, Math.round(protein) || 0),
    carbs: Math.max(0, Math.round(carbs) || 0),
    fat: Math.max(0, Math.round(fat) || 0),
    reduction: 0,
  }

  if (!Number.isFinite(calories) || calories <= 0) return unchanged
  if (!Number.isFinite(avg) || avg <= 0) return unchanged

  // Desconto pretendido = gasto médio de um treino, limitado pelo teto.
  let reduction = Math.min(Math.round(avg), MAX_REDUCTION_KCAL)

  // Piso da meta: nunca abaixo do maior entre o piso absoluto e (meta − 25%).
  const floor = Math.max(ABSOLUTE_FLOOR_KCAL, Math.round(calories * (1 - MAX_CUT_FRACTION)))
  reduction = Math.min(reduction, Math.max(0, Math.round(calories) - floor))

  if (reduction < MIN_REDUCTION_KCAL) return unchanged

  const newCalories = Math.round(calories) - reduction

  // Proteína fica intacta; o corte sai de carbo + gordura, proporcional ao peso
  // calórico atual de cada um. Sem carbo/gordura pra cortar, só a meta cai.
  const carbsKcal = Math.max(0, carbs) * CALORIES_PER_GRAM.carbs
  const fatKcal = Math.max(0, fat) * CALORIES_PER_GRAM.fat
  const nonProteinKcal = carbsKcal + fatKcal

  if (nonProteinKcal <= 0) {
    return { calories: newCalories, protein: unchanged.protein, carbs: unchanged.carbs, fat: unchanged.fat, reduction }
  }

  const carbsShare = carbsKcal / nonProteinKcal
  const newCarbsKcal = Math.max(0, carbsKcal - reduction * carbsShare)
  const newFatKcal = Math.max(0, fatKcal - reduction * (1 - carbsShare))

  return {
    calories: newCalories,
    protein: unchanged.protein,
    carbs: Math.max(0, Math.round(newCarbsKcal / CALORIES_PER_GRAM.carbs)),
    fat: Math.max(0, Math.round(newFatKcal / CALORIES_PER_GRAM.fat)),
    reduction,
  }
}

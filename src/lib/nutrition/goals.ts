/**
 * Cálculo de metas nutricionais — funções PURAS (BMR, TDEE, macros), sem nenhuma
 * dependência de servidor. Fica separado de engine.ts (que tem trackMeal +
 * supabase/server) pra poder ser importado no CLIENT sem puxar next/headers pro
 * bundle. Fonte ÚNICA: web e overlay usam as mesmas funções daqui.
 *
 * A FÓRMULA de BMR/TDEE não mora aqui: vive em `lib/health/mifflinStJeor`,
 * compartilhada com a avaliação física (as duas a tinham escrita, igual).
 */
import { basalMetabolicRate, totalDailyEnergyExpenditure } from '@/lib/health/mifflinStJeor'

export type Gender = 'MALE' | 'FEMALE'

export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'VERY_ACTIVE' | 'EXTRA_ACTIVE'

export interface UserStats {
  weight: number
  height: number
  age: number
  gender: Gender
  activityLevel: ActivityLevel
}

export type Goal = 'CUT' | 'MAINTAIN' | 'BULK'

// ── Activity level multipliers (TDEE = BMR × fator) ──────────────────────────
const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  VERY_ACTIVE: 1.725,
  EXTRA_ACTIVE: 1.9,
}

export function getActivityMultiplier(level: ActivityLevel | string | null | undefined): number {
  const key = String(level ?? '').toUpperCase() as ActivityLevel
  return ACTIVITY_MULTIPLIER[key] ?? ACTIVITY_MULTIPLIER.MODERATE
}

export function calculateBMR(stats: UserStats): number {
  const weight = Number(stats?.weight)
  const height = Number(stats?.height)
  const age = Number(stats?.age)
  const gender = stats?.gender

  // Erros TIPADOS por campo: a nutrição os usa para dizer ao usuário o que
  // falta preencher, então a validação fica aqui e não no núcleo.
  if (!Number.isFinite(weight) || weight <= 0) throw new Error('nutrition_invalid_weight')
  if (!Number.isFinite(height) || height <= 0) throw new Error('nutrition_invalid_height')
  if (!Number.isFinite(age) || age <= 0) throw new Error('nutrition_invalid_age')
  if (gender !== 'MALE' && gender !== 'FEMALE') throw new Error('nutrition_invalid_gender')

  // A conta vive em `lib/health/mifflinStJeor` — era a mesma fórmula escrita
  // aqui e em `utils/calculations/bodyComposition`.
  const bmr = basalMetabolicRate({ weightKg: weight, heightCm: height, ageYears: age, sex: gender })
  if (bmr == null) throw new Error('nutrition_bmr_invalid_result')
  return bmr
}

/**
 * Calculates TDEE (Total Daily Energy Expenditure) = BMR × activity multiplier.
 * This is the actual calorie need per day before goal adjustment.
 */
export function calculateTDEE(stats: UserStats): number {
  const bmr = calculateBMR(stats)
  const multiplier = getActivityMultiplier(stats.activityLevel)
  const tdee = totalDailyEnergyExpenditure(bmr, multiplier)
  if (tdee == null) throw new Error('nutrition_bmr_invalid_result')
  return tdee
}

const CALORIES_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
} as const

const GOAL_CALORIE_MULTIPLIER: Record<Goal, number> = {
  CUT: 0.85,
  MAINTAIN: 1,
  BULK: 1.1,
}

const GOAL_MACRO_SPLIT: Record<Goal, { protein: number; carbs: number; fat: number }> = {
  CUT: { protein: 0.35, carbs: 0.4, fat: 0.25 },
  MAINTAIN: { protein: 0.3, carbs: 0.4, fat: 0.3 },
  BULK: { protein: 0.25, carbs: 0.5, fat: 0.25 },
}

// Proteína-alvo por g/kg de peso (padrão fisiológico 1,6–2,2 g/kg), não por % das
// calorias — que podia estourar a faixa (ex.: 2,7 g/kg). Mais proteína no corte
// (preserva massa magra em déficit) e menos no bulk (sobra energia pra carbo).
const GOAL_PROTEIN_G_PER_KG: Record<Goal, number> = {
  CUT: 2.2,
  MAINTAIN: 2.0,
  BULK: 1.8,
}

/**
 * Calculates macro targets from a TDEE (or BMR) base and a goal.
 * For accurate results, pass TDEE (not raw BMR) as the first parameter.
 * When weightKg is provided, protein is set by g/kg (physiological standard);
 * otherwise it falls back to a % of calories (backward compatible).
 */
export function calculateMacros(tdee: number, goal: Goal, weightKg?: number | null): { protein: number; carbs: number; fat: number } {
  const baseCalories = Number(tdee)
  if (!Number.isFinite(baseCalories) || baseCalories <= 0) throw new Error('nutrition_invalid_calories')
  if (goal !== 'CUT' && goal !== 'MAINTAIN' && goal !== 'BULK') throw new Error('nutrition_invalid_goal')

  const targetCalories = Math.round(baseCalories * (GOAL_CALORIE_MULTIPLIER[goal] ?? 1))
  const split = GOAL_MACRO_SPLIT[goal]

  // Proteína por g/kg (padrão fisiológico) quando o peso está disponível; sem peso
  // (chamada só com calorias), cai no % das calorias por compatibilidade.
  const w = Number(weightKg)
  const protein = (Number.isFinite(w) && w > 0)
    ? Math.max(0, Math.round(w * GOAL_PROTEIN_G_PER_KG[goal]))
    : Math.max(0, Math.round((targetCalories * split.protein) / CALORIES_PER_GRAM.protein))

  const fat = Math.max(0, Math.round((targetCalories * split.fat) / CALORIES_PER_GRAM.fat))

  const remainingCalories = targetCalories - protein * CALORIES_PER_GRAM.protein - fat * CALORIES_PER_GRAM.fat
  const carbs = Math.max(0, Math.round(remainingCalories / CALORIES_PER_GRAM.carbs))

  return { protein, carbs, fat }
}

/**
 * Convenience: calculates full nutrition goals (calories + macros) from user stats + goal.
 * Uses TDEE (not raw BMR) as the base.
 */
export function calculateNutritionGoals(stats: UserStats, goal: Goal): {
  calories: number; protein: number; carbs: number; fat: number
} {
  const tdee = calculateTDEE(stats)
  const targetCalories = Math.round(tdee * (GOAL_CALORIE_MULTIPLIER[goal] ?? 1))
  // Passa o peso pra proteína ser calculada por g/kg (não % das calorias).
  const macros = calculateMacros(tdee, goal, stats?.weight)
  return { calories: targetCalories, ...macros }
}

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

export function calculateBMR(stats: UserStats): number {
  const weight = Number(stats?.weight)
  const height = Number(stats?.height)
  const age = Number(stats?.age)
  const gender = stats?.gender

  if (!Number.isFinite(weight) || weight <= 0) throw new Error('nutrition_invalid_weight')
  if (!Number.isFinite(height) || height <= 0) throw new Error('nutrition_invalid_height')
  if (!Number.isFinite(age) || age <= 0) throw new Error('nutrition_invalid_age')
  if (gender !== 'MALE' && gender !== 'FEMALE') throw new Error('nutrition_invalid_gender')

  const bmr =
    gender === 'MALE'
      ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
      : 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age

  if (!Number.isFinite(bmr) || bmr <= 0) throw new Error('nutrition_bmr_invalid_result')
  return Math.round(bmr)
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

export function calculateMacros(bmr: number, goal: Goal): { protein: number; carbs: number; fat: number } {
  const baseCalories = Number(bmr)
  if (!Number.isFinite(baseCalories) || baseCalories <= 0) throw new Error('nutrition_invalid_calories')
  if (goal !== 'CUT' && goal !== 'MAINTAIN' && goal !== 'BULK') throw new Error('nutrition_invalid_goal')

  const targetCalories = Math.round(baseCalories * (GOAL_CALORIE_MULTIPLIER[goal] ?? 1))
  const split = GOAL_MACRO_SPLIT[goal]

  const protein = Math.max(0, Math.round((targetCalories * split.protein) / CALORIES_PER_GRAM.protein))
  const fat = Math.max(0, Math.round((targetCalories * split.fat) / CALORIES_PER_GRAM.fat))

  const remainingCalories = targetCalories - protein * CALORIES_PER_GRAM.protein - fat * CALORIES_PER_GRAM.fat
  const carbs = Math.max(0, Math.round(remainingCalories / CALORIES_PER_GRAM.carbs))

  return { protein, carbs, fat }
}

export interface MealLog {
  foodName: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export async function trackMeal(userId: string, meal: MealLog, dateKey?: string): Promise<any> {
  try {
    const safeUserId = typeof userId === 'string' ? userId.trim() : ''
    if (!safeUserId) throw new Error('nutrition_invalid_user_id')
    if (!meal) throw new Error('nutrition_invalid_meal')

    const foodName = typeof meal.foodName === 'string' ? meal.foodName.trim() : ''
    if (!foodName) throw new Error('nutrition_invalid_meal_food_name')

    const calories = Number(meal.calories)
    const protein = Number(meal.protein)
    const carbs = Number(meal.carbs)
    const fat = Number(meal.fat)

    if (!Number.isFinite(calories) || calories < 0) throw new Error('nutrition_invalid_meal_calories')
    if (!Number.isFinite(protein) || protein < 0) throw new Error('nutrition_invalid_meal_protein')
    if (!Number.isFinite(carbs) || carbs < 0) throw new Error('nutrition_invalid_meal_carbs')
    if (!Number.isFinite(fat) || fat < 0) throw new Error('nutrition_invalid_meal_fat')

    if (typeof window !== 'undefined') throw new Error('nutrition_track_meal_server_only')

    const resolvedDateKey = typeof dateKey === 'string' ? dateKey.trim() : ''
    if (!resolvedDateKey) throw new Error('nutrition_invalid_date')

    const { createClient } = await import('../../utils/supabase/server')
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('nutrition_add_meal_entry', {
      p_date: resolvedDateKey,
      p_food_name: foodName,
      p_calories: calories,
      p_protein: protein,
      p_carbs: carbs,
      p_fat: fat,
    })

    if (error) throw new Error(error.message || 'nutrition_log_upsert_failed')
    const row = Array.isArray(data) ? data[0] : null
    return row || null
  } catch (e) {
    throw new Error(e?.message || 'nutrition_track_meal_failed')
  }
}

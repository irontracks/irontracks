import { getErrorMessage } from '@/utils/errorMessage'
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

// ── Activity level multipliers (Harris-Benedict / Mifflin extension) ─────────
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

/**
 * Calculates TDEE (Total Daily Energy Expenditure) = BMR × activity multiplier.
 * This is the actual calorie need per day before goal adjustment.
 */
export function calculateTDEE(stats: UserStats): number {
  const bmr = calculateBMR(stats)
  const multiplier = getActivityMultiplier(stats.activityLevel)
  return Math.round(bmr * multiplier)
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

/**
 * Calculates macro targets from a TDEE (or BMR) base and a goal.
 * For accurate results, pass TDEE (not raw BMR) as the first parameter.
 */
export function calculateMacros(tdee: number, goal: Goal): { protein: number; carbs: number; fat: number } {
  const baseCalories = Number(tdee)
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

/**
 * Convenience: calculates full nutrition goals (calories + macros) from user stats + goal.
 * Uses TDEE (not raw BMR) as the base.
 */
export function calculateNutritionGoals(stats: UserStats, goal: Goal): {
  calories: number; protein: number; carbs: number; fat: number
} {
  const tdee = calculateTDEE(stats)
  const targetCalories = Math.round(tdee * (GOAL_CALORIE_MULTIPLIER[goal] ?? 1))
  const macros = calculateMacros(tdee, goal)
  return { calories: targetCalories, ...macros }
}

export interface MealLog {
  foodName: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export async function trackMeal(userId: string, meal: MealLog, dateKey?: string): Promise<Record<string, unknown> | null> {
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

    // 1. Insert the meal entry directly (bypassing broken RPC)
    const { data: insertedEntry, error: insertError } = await supabase
      .from('nutrition_meal_entries')
      .insert({
        user_id: safeUserId,
        date: resolvedDateKey,
        food_name: foodName,
        calories,
        protein,
        carbs,
        fat,
      })
      .select('id, created_at, food_name, calories, protein, carbs, fat')
      .single()

    if (insertError) throw new Error(insertError.message || 'nutrition_insert_entry_failed')

    // 2. Recalculate daily totals from all entries for this date
    const { data: allEntries, error: sumError } = await supabase
      .from('nutrition_meal_entries')
      .select('calories, protein, carbs, fat')
      .eq('user_id', safeUserId)
      .eq('date', resolvedDateKey)

    if (sumError) throw new Error(sumError.message || 'nutrition_sum_entries_failed')

    const entriesList = Array.isArray(allEntries) ? allEntries : []
    const totalCalories = entriesList.reduce((sum, e) => sum + (Number((e as Record<string, unknown>)?.calories) || 0), 0)
    const totalProtein = entriesList.reduce((sum, e) => sum + (Number((e as Record<string, unknown>)?.protein) || 0), 0)
    const totalCarbs = entriesList.reduce((sum, e) => sum + (Number((e as Record<string, unknown>)?.carbs) || 0), 0)
    const totalFat = entriesList.reduce((sum, e) => sum + (Number((e as Record<string, unknown>)?.fat) || 0), 0)

    // 3. Upsert daily_nutrition_logs with new totals
    const { error: upsertError } = await supabase
      .from('daily_nutrition_logs')
      .upsert(
        {
          user_id: safeUserId,
          date: resolvedDateKey,
          calories: Math.round(totalCalories),
          protein: Math.round(totalProtein),
          carbs: Math.round(totalCarbs),
          fat: Math.round(totalFat),
        },
        { onConflict: 'user_id,date' }
      )

    if (upsertError) {
      // Non-fatal: entry was saved, daily log update failed
      // Log but don't throw — the entry is already persisted
      console.warn('[nutrition] daily_nutrition_logs upsert failed:', upsertError.message)
    }

    // Return shape matching what NutritionMixer expects
    return {
      entry_id: insertedEntry?.id ?? '',
      id: insertedEntry?.id ?? '',
      created_at: insertedEntry?.created_at ?? new Date().toISOString(),
      food_name: insertedEntry?.food_name ?? foodName,
      calories,
      protein,
      carbs,
      fat,
      totals_calories: Math.round(totalCalories),
      totals_protein: Math.round(totalProtein),
      totals_carbs: Math.round(totalCarbs),
      totals_fat: Math.round(totalFat),
    }
  } catch (e: unknown) {
    throw new Error(getErrorMessage(e) || 'nutrition_track_meal_failed')
  }
}

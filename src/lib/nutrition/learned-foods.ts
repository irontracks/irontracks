import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from './food-database'

/**
 * Normalize a food name to a lowercase key without accents/special chars.
 */
export function normalizeFoodKey(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export type LearnedFoodRow = {
  food_key: string
  display_name: string
  kcal_per_100g: number
  protein_per_100g: number
  carbs_per_100g: number
  fat_per_100g: number
  use_count: number
}

/**
 * Fetch all learned foods for a user and convert them to the same format
 * as the static food database (FoodItem per 100g).
 */
export async function loadLearnedFoods(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, FoodItem>> {
  try {
    const { data, error } = await supabase
      .from('nutrition_learned_foods')
      .select('food_key, display_name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, use_count')
      .eq('user_id', userId)
      .order('use_count', { ascending: false })
      .limit(500)

    if (error || !data) return {}

    const result: Record<string, FoodItem> = {}
    for (const row of data) {
      const key = String(row.food_key || '').trim()
      if (!key) continue
      result[key] = {
        kcal: Number(row.kcal_per_100g) || 0,
        p: Number(row.protein_per_100g) || 0,
        c: Number(row.carbs_per_100g) || 0,
        f: Number(row.fat_per_100g) || 0,
      }
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Save an AI-estimated food to the learned foods table.
 * Uses UPSERT — if the food already exists for this user,
 * it updates the nutritional values and increments the use_count.
 *
 * @param originalInput The original text the user typed (e.g. "300g arroz branco")
 * @param totalCalories Total calories of the meal (not per 100g)
 * @param totalProtein Total protein of the meal
 * @param totalCarbs Total carbs of the meal
 * @param totalFat Total fat of the meal
 * @param foodName Display name from AI (e.g. "Arroz branco com frango")
 */
export async function saveLearnedFood(
  supabase: SupabaseClient,
  userId: string,
  originalInput: string,
  foodName: string,
  totalCalories: number,
  totalProtein: number,
  totalCarbs: number,
  totalFat: number,
): Promise<void> {
  try {
    // Normalize the original input as the key for future matching
    const foodKey = normalizeFoodKey(originalInput)
    if (!foodKey || foodKey.length < 2) return

    // Rate limit: max 200 learned foods per user
    const { count, error: countError } = await supabase
      .from('nutrition_learned_foods')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (countError) return
    if ((count ?? 0) >= 200) return // silently cap

    // Sanitize the display name
    const safeName = String(foodName || originalInput).trim()
      .replace(/<[^>]*>/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .slice(0, 120)

    await supabase
      .from('nutrition_learned_foods')
      .upsert(
        {
          user_id: userId,
          food_key: foodKey,
          display_name: safeName || 'Refeição',
          kcal_per_100g: Math.round(totalCalories),
          protein_per_100g: Math.round(totalProtein),
          carbs_per_100g: Math.round(totalCarbs),
          fat_per_100g: Math.round(totalFat),
          source: 'ai',
          use_count: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,food_key' },
      )
  } catch {
    // Non-critical — don't break the flow if save fails
  }
}

/**
 * Increment the use_count when a learned food is matched by the parser.
 */
export async function bumpLearnedFoodUsage(
  supabase: SupabaseClient,
  userId: string,
  foodKey: string,
): Promise<void> {
  try {
    await supabase.rpc('increment_learned_food_usage', {
      p_user_id: userId,
      p_food_key: foodKey,
    })
  } catch {
    // Best-effort — ignore failures
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from '../food-database'

type TacoRow = {
  food_key: string
  name: string
  aliases: string[]
  kcal_per_100g: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
}

/**
 * Load all TACO foods from Supabase as a FoodItem map.
 * Keys include both food_key and all aliases for parser compatibility.
 * Returns {} on error — non-critical, parser falls back to OFF/Gemini.
 */
export async function loadTacoFoods(supabase: SupabaseClient): Promise<Record<string, FoodItem>> {
  try {
    const { data, error } = await supabase
      .from('foods_taco')
      .select('food_key, name, aliases, kcal_per_100g, protein, carbs, fat, fiber')

    if (error || !data) return {}

    const result: Record<string, FoodItem> = {}

    for (const row of data as TacoRow[]) {
      const key = String(row.food_key || '').trim()
      if (!key) continue

      const item: FoodItem = {
        kcal: Number(row.kcal_per_100g) || 0,
        p: Number(row.protein) || 0,
        c: Number(row.carbs) || 0,
        f: Number(row.fat) || 0,
      }

      result[key] = item

      const aliases = Array.isArray(row.aliases) ? row.aliases : []
      for (const alias of aliases) {
        const a = String(alias || '').trim().toLowerCase()
        if (a) result[a] = item
      }
    }

    return result
  } catch {
    return {}
  }
}

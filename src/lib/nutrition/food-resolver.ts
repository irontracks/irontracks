import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from './food-database'
import type { MealLog } from './engine'
import { analyzeMeal, type ParsedMealItem } from './parser'
import { loadTacoFoods } from './sources/taco-source'
import { searchOffByText } from './sources/off-source'
import { loadLearnedFoods } from './learned-foods'

type ResolveResult = {
  meal: MealLog
  items: ParsedMealItem[]
  source: 'local' | 'taco_or_learned' | 'off'
}

/**
 * The parser strips " de " from food names when extracting from quantity strings
 * (e.g. "200ml caldo de cana" → foodName = "caldo cana").
 * This helper adds de-less variants so keys like "caldo de cana" still match.
 */
function expandFoodKeys(foods: Record<string, FoodItem>): Record<string, FoodItem> {
  const expanded: Record<string, FoodItem> = { ...foods }
  for (const [key, item] of Object.entries(foods)) {
    const withoutDe = key.replace(/ de /g, ' ').replace(/  +/g, ' ').trim()
    if (withoutDe !== key) {
      expanded[withoutDe] = item
    }
  }
  return expanded
}

/** Load the user's custom foods from nutrition_custom_foods as a FoodItem map. */
async function loadCustomFoods(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, FoodItem>> {
  try {
    const { data } = await supabase
      .from('nutrition_custom_foods')
      .select('name, aliases, kcal_per100g, protein_per100g, carbs_per100g, fat_per100g')
      .eq('user_id', userId)
      .limit(50)

    const result: Record<string, FoodItem> = {}
    const rows = Array.isArray(data) ? data : []
    for (const row of rows) {
      const item: FoodItem = {
        kcal: Number(row.kcal_per100g) || 0,
        p: Number(row.protein_per100g) || 0,
        c: Number(row.carbs_per100g) || 0,
        f: Number(row.fat_per100g) || 0,
      }
      const primaryKey = String(row.name ?? '').toLowerCase().trim()
      if (primaryKey) result[primaryKey] = item
      const aliases = Array.isArray(row.aliases) ? row.aliases : []
      for (const alias of aliases) {
        const k = String(alias ?? '').toLowerCase().trim()
        if (k) result[k] = item
      }
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Attempt to resolve a free-text meal description using:
 *   Phase 1: hardcoded base + TACO + learned foods (all in-process / Supabase)
 *   Phase 2: Open Food Facts cache + API (only if Phase 1 fails)
 *
 * Returns null if resolution fails — caller should fall back to Gemini.
 */
export async function resolveFood(
  supabase: SupabaseClient,
  userId: string,
  text: string,
): Promise<ResolveResult | null> {
  // ── Phase 1a: hardcoded base only (zero latency) ────────────────────────────
  const a1 = analyzeMeal(text)
  if (a1.unknownLines.length === 0 && a1.items.length > 0) {
    return { meal: a1.meal, items: a1.items, source: 'local' }
  }

  // ── Phase 1b: augment with TACO + learned + custom foods (parallel) ─────────
  const [tacoFoods, learned, customFoods] = await Promise.all([
    loadTacoFoods(supabase),
    loadLearnedFoods(supabase, userId),
    loadCustomFoods(supabase, userId),
  ])
  const phase1ExtraFoods = expandFoodKeys({ ...tacoFoods, ...learned, ...customFoods })

  const a2 = analyzeMeal(text, phase1ExtraFoods)
  if (a2.unknownLines.length === 0 && a2.items.length > 0) {
    return { meal: a2.meal, items: a2.items, source: 'taco_or_learned' }
  }
  if (a2.unknownLines.length === 0) return null // nada reconhecido nem desconhecido

  // ── Phase 2: try Open Food Facts for each unknown line ────────────────────
  const offResults = await Promise.all(
    a2.unknownLines.map((line) => searchOffByText(supabase, line)),
  )
  const offFoods: Record<string, { kcal: number; p: number; c: number; f: number }> = {}
  for (const r of offResults) {
    Object.assign(offFoods, r)
  }
  if (Object.keys(offFoods).length === 0) return null

  const a3 = analyzeMeal(text, expandFoodKeys({ ...phase1ExtraFoods, ...offFoods }))
  if (a3.unknownLines.length === 0 && a3.items.length > 0) {
    return { meal: a3.meal, items: a3.items, source: 'off' }
  }
  return null
}

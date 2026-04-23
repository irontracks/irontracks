import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from './food-database'
import type { MealLog } from './engine'
import { parseInput } from './parser'
import { loadTacoFoods } from './sources/taco-source'
import { searchOffByText } from './sources/off-source'
import { loadLearnedFoods } from './learned-foods'

type ResolveResult = {
  meal: MealLog
  source: 'local' | 'taco_or_learned' | 'off'
}

const UNKNOWN_PREFIX = 'nutrition_parser_unknown_food:'

function extractUnknownLines(errorMessage: string): string[] {
  if (!errorMessage.startsWith(UNKNOWN_PREFIX)) return []
  const raw = errorMessage.slice(UNKNOWN_PREFIX.length).trim()
  return raw.split('|').map((s) => s.trim()).filter(Boolean)
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
  // ── Phase 1a: try with hardcoded base only (zero latency) ───────────────────
  try {
    const meal = parseInput(text)
    return { meal, source: 'local' }
  } catch (e: unknown) {
    const msg = String((e as Error)?.message || '')
    if (!msg.startsWith(UNKNOWN_PREFIX)) return null
  }

  // ── Phase 1b: augment with TACO + learned + custom foods (parallel) ─────────
  const [tacoFoods, learned, customFoods] = await Promise.all([
    loadTacoFoods(supabase),
    loadLearnedFoods(supabase, userId),
    loadCustomFoods(supabase, userId),
  ])
  const phase1ExtraFoods = expandFoodKeys({ ...tacoFoods, ...learned, ...customFoods })

  try {
    const meal = parseInput(text, phase1ExtraFoods)
    return { meal, source: 'taco_or_learned' }
  } catch (e: unknown) {
    const msg = String((e as Error)?.message || '')
    const unknownLines = extractUnknownLines(msg)
    if (unknownLines.length === 0) return null

    // ── Phase 2: try Open Food Facts for each unknown line ────────────────────
    const offResults = await Promise.all(
      unknownLines.map((line) => searchOffByText(supabase, line)),
    )
    const offFoods: Record<string, { kcal: number; p: number; c: number; f: number }> = {}
    for (const r of offResults) {
      Object.assign(offFoods, r)
    }

    if (Object.keys(offFoods).length === 0) return null

    try {
      const meal = parseInput(text, expandFoodKeys({ ...phase1ExtraFoods, ...offFoods }))
      return { meal, source: 'off' }
    } catch {
      return null
    }
  }
}

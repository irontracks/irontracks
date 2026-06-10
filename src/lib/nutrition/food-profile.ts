import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeFoodKey } from './learned-foods'

/**
 * "Food memory" — aggregates what the user actually eats from learned foods
 * (already counted by use_count) + recent meal entries, to feed the AI diet
 * generator so it builds plans around the user's real repertoire.
 */

export type FoodProfileItem = {
  name: string
  key: string
  count: number
}

export type FoodProfile = {
  topFoods: FoodProfileItem[]
  sampleCount: number
}

const LOOKBACK_DAYS = 60
const MAX_FOODS = 20
const MAX_ENTRIES = 2000

function dateKeyDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Builds a compact food profile for the given user. Resilient: any read failure
 * degrades to an empty/partial profile instead of throwing.
 */
export async function buildFoodProfile(supabase: SupabaseClient, userId: string): Promise<FoodProfile> {
  const uid = String(userId || '').trim()
  if (!uid) return { topFoods: [], sampleCount: 0 }

  const byKey = new Map<string, FoodProfileItem>()

  // 1) Learned foods — primary source (pre-aggregated by use_count).
  try {
    const { data } = await supabase
      .from('nutrition_learned_foods')
      .select('food_key, display_name, use_count')
      .eq('user_id', uid)
      .order('use_count', { ascending: false })
      .limit(50)
    for (const row of (Array.isArray(data) ? data : [])) {
      const name = String((row as Record<string, unknown>)?.display_name || (row as Record<string, unknown>)?.food_key || '').trim()
      const key = normalizeFoodKey(name)
      if (!key || key.length < 2) continue
      byKey.set(key, { name: name.slice(0, 80), key, count: Number((row as Record<string, unknown>)?.use_count) || 1 })
    }
  } catch {
    // ignore — partial profile is fine
  }

  // 2) Recent meal entries — frequency by food name (complements learned foods).
  let sampleCount = 0
  try {
    const { data } = await supabase
      .from('nutrition_meal_entries')
      .select('food_name')
      .eq('user_id', uid)
      .gte('date', dateKeyDaysAgo(LOOKBACK_DAYS))
      .limit(MAX_ENTRIES)
    const rows = Array.isArray(data) ? data : []
    sampleCount = rows.length
    for (const row of rows) {
      const name = String((row as Record<string, unknown>)?.food_name || '').trim()
      const key = normalizeFoodKey(name)
      if (!key || key.length < 2) continue
      const existing = byKey.get(key)
      if (existing) existing.count += 1
      else byKey.set(key, { name: name.slice(0, 80), key, count: 1 })
    }
  } catch {
    // ignore
  }

  const topFoods = [...byKey.values()].sort((a, b) => b.count - a.count).slice(0, MAX_FOODS)
  return { topFoods, sampleCount }
}

/**
 * Token-friendly comma-separated list of the user's preferred foods for prompt
 * injection. Returns an empty string when there is no history.
 */
export function foodProfileToPromptList(profile: FoodProfile): string {
  if (!profile?.topFoods?.length) return ''
  return profile.topFoods.map((f) => f.name).filter(Boolean).join(', ')
}

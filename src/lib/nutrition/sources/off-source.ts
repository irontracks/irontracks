import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from '../food-database'

const OFF_TIMEOUT_MS = 5_000

type OFFNutriments = {
  'energy-kcal_100g'?: number
  proteins_100g?: number
  carbohydrates_100g?: number
  fat_100g?: number
  fiber_100g?: number
}

type OFFProduct = {
  product_name?: string
  brands?: string
  nutriments?: OFFNutriments
}

function normalizeSlug(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

/**
 * Generate a stable food_key from OFF product name + brand.
 * Used as unique key in foods_off_cache.
 */
export function buildFoodKeyFromOff(name: string, brand: string): string {
  const parts = [name, brand].filter(Boolean).join(' ')
  return normalizeSlug(parts).slice(0, 120)
}

function offProductToFoodItem(product: OFFProduct): FoodItem | null {
  const n = product.nutriments
  if (!n) return null
  const kcal = Number(n['energy-kcal_100g']) || 0
  const p = Number(n['proteins_100g']) || 0
  const c = Number(n['carbohydrates_100g']) || 0
  const f = Number(n['fat_100g']) || 0
  if (kcal === 0 && p === 0 && c === 0 && f === 0) return null
  return { kcal, p, c, f }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

async function saveToCacheTable(
  supabase: SupabaseClient,
  barcode: string | null,
  foodKey: string,
  name: string,
  brand: string,
  item: FoodItem,
): Promise<void> {
  try {
    await supabase.from('foods_off_cache').insert({
      barcode: barcode ?? null,
      food_key: foodKey,
      name,
      brand: brand || null,
      kcal_per_100g: item.kcal,
      protein: item.p,
      carbs: item.c,
      fat: item.f,
      source: 'open_food_facts',
    })
  } catch {
    // Non-critical — cache miss is recoverable
  }
}

/**
 * Lookup a food by EAN barcode.
 * Checks foods_off_cache first; falls back to OFF API.
 * Returns null if product not found or macros are missing.
 * No Gemini fallback.
 */
export async function lookupOffByBarcode(
  supabase: SupabaseClient,
  ean: string,
): Promise<{ item: FoodItem; name: string; foodKey: string } | null> {
  try {
    // 1. Check cache
    const { data: cached } = await supabase
      .from('foods_off_cache')
      .select('food_key, name, brand, kcal_per_100g, protein, carbs, fat')
      .eq('barcode', ean)
      .maybeSingle()

    if (cached) {
      return {
        item: { kcal: Number(cached.kcal_per_100g), p: Number(cached.protein), c: Number(cached.carbs), f: Number(cached.fat) },
        name: String(cached.name),
        foodKey: String(cached.food_key),
      }
    }

    // 2. Call OFF API
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}?fields=product_name,brands,nutriments`
    const res = await fetchWithTimeout(url, OFF_TIMEOUT_MS)
    if (!res.ok) return null
    const json = await res.json() as { status: number; product?: OFFProduct }
    if (json.status !== 1 || !json.product) return null

    const product = json.product
    const item = offProductToFoodItem(product)
    if (!item) return null

    const name = String(product.product_name || '').trim() || 'Produto'
    const brand = String(product.brands || '').trim()
    const foodKey = buildFoodKeyFromOff(name, brand)

    await saveToCacheTable(supabase, ean, foodKey, name, brand, item)

    return { item, name, foodKey }
  } catch {
    return null
  }
}

/**
 * Search OFF by free text (product name).
 * Checks foods_off_cache first; falls back to OFF search API.
 * Returns a Record<string, FoodItem> compatible with parser extraFoods.
 */
export async function searchOffByText(
  supabase: SupabaseClient,
  query: string,
): Promise<Record<string, FoodItem>> {
  const q = (query || '').trim()
  if (!q) return {}

  try {
    // 1. Check cache by food_key similarity
    const foodKey = normalizeSlug(q)
    const { data: cached } = await supabase
      .from('foods_off_cache')
      .select('food_key, name, kcal_per_100g, protein, carbs, fat')
      .ilike('food_key', `%${foodKey}%`)
      .maybeSingle()

    if (cached) {
      const item: FoodItem = {
        kcal: Number(cached.kcal_per_100g),
        p: Number(cached.protein),
        c: Number(cached.carbs),
        f: Number(cached.fat),
      }
      const result: Record<string, FoodItem> = {}
      result[String(cached.food_key)] = item
      result[String(cached.name).toLowerCase()] = item
      return result
    }

    // 2. Call OFF search API
    const encoded = encodeURIComponent(q)
    const url = `https://world.openfoodfacts.org/cgi/search.pl?action=process&search_terms=${encoded}&json=1&page_size=3&fields=product_name,brands,nutriments`
    const res = await fetchWithTimeout(url, OFF_TIMEOUT_MS)
    if (!res.ok) return {}
    const json = await res.json() as { count?: number; products?: OFFProduct[] }
    const products = Array.isArray(json.products) ? json.products : []
    if (products.length === 0) return {}

    const result: Record<string, FoodItem> = {}

    for (const product of products.slice(0, 3)) {
      const item = offProductToFoodItem(product)
      if (!item) continue

      const name = String(product.product_name || '').trim()
      const brand = String(product.brands || '').trim()
      if (!name) continue

      const key = buildFoodKeyFromOff(name, brand)
      result[key] = item
      result[name.toLowerCase()] = item

      // Fire-and-forget cache save
      void saveToCacheTable(supabase, null, key, name, brand, item)
    }

    return result
  } catch {
    return {}
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from './food-database'
import { lookupOffByBarcode } from './sources/off-source'

type BarcodeResolution = {
  item: FoodItem
  name: string
  foodKey: string
  source: 'library' | 'off'
}

/**
 * Resolve a product by EAN barcode.
 *
 * 1. The user's own library (nutrition_custom_foods.barcode) — covers products
 *    they scanned/registered manually, including BR products that Open Food
 *    Facts doesn't have. Instant and offline.
 * 2. Open Food Facts (local cache + API).
 *
 * Returns null when nothing matches (caller then offers manual registration).
 */
export async function resolveBarcode(
  supabase: SupabaseClient,
  ean: string,
  userId?: string,
): Promise<BarcodeResolution | null> {
  const cleanEan = String(ean || '').trim()
  if (!cleanEan) return null

  // 1. User library by barcode
  const uid = String(userId || '').trim()
  if (uid) {
    const { data } = await supabase
      .from('nutrition_custom_foods')
      .select('name, kcal_per100g, protein_per100g, carbs_per100g, fat_per100g')
      .eq('user_id', uid)
      .eq('barcode', cleanEan)
      .limit(1)
      .maybeSingle()
    if (data) {
      return {
        item: {
          kcal: Number(data.kcal_per100g) || 0,
          p: Number(data.protein_per100g) || 0,
          c: Number(data.carbs_per100g) || 0,
          f: Number(data.fat_per100g) || 0,
        },
        name: String(data.name || 'Produto'),
        foodKey: cleanEan,
        source: 'library',
      }
    }
  }

  // 2. Open Food Facts (cache + API)
  const off = await lookupOffByBarcode(supabase, cleanEan)
  return off ? { ...off, source: 'off' } : null
}

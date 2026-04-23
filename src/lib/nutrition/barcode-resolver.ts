import type { SupabaseClient } from '@supabase/supabase-js'
import type { FoodItem } from './food-database'
import { lookupOffByBarcode } from './sources/off-source'

type BarcodeResolution = {
  item: FoodItem
  name: string
  foodKey: string
}

/**
 * Resolve a product by EAN barcode using OFF cache + API.
 * No Gemini fallback — an unrecognized barcode is an explicit error.
 * Returns null when the product is not found.
 */
export async function resolveBarcode(
  supabase: SupabaseClient,
  ean: string,
): Promise<BarcodeResolution | null> {
  const cleanEan = String(ean || '').trim()
  if (!cleanEan) return null

  return lookupOffByBarcode(supabase, cleanEan)
}

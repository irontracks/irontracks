import { kvGet, kvSet } from './idb'

/**
 * Cache de LEITURA da aba de Nutrição, por usuário+dia, sobre o KV do idb
 * (que já cascateia SQLite nativo → IndexedDB → localStorage). Permite abrir a
 * aba e ver o dia já lançado mesmo sem internet.
 *
 * Chaves distintas por concern (overlay / meals / foods) pra os dois
 * componentes (NutritionOverlay e NutritionMixer) não clobberem um ao outro.
 */

export interface NutritionOverlayCache {
  totals: { calories: number; protein: number; carbs: number; fat: number }
  goals: { calories: number; protein: number; carbs: number; fat: number }
  goalsSource: string
  workoutCalories: number
  cachedAt: number
}

export interface NutritionMealsCache {
  entries: Array<Record<string, unknown>>
  water_ml: number
  cachedAt: number
}

const overlayKey = (uid: string, dateKey: string) => `nutrition_overlay_v1.${uid}.${dateKey}`
const mealsKey = (uid: string, dateKey: string) => `nutrition_meals_v1.${uid}.${dateKey}`
const customFoodsKey = (uid: string) => `nutrition_custom_foods_v1.${uid}`

const ok = (uid: unknown, dateKey?: unknown) =>
  Boolean(String(uid || '').trim()) && (dateKey === undefined || Boolean(String(dateKey || '').trim()))

export async function setNutritionOverlayCache(
  uid: string,
  dateKey: string,
  data: Omit<NutritionOverlayCache, 'cachedAt'>,
): Promise<void> {
  if (!ok(uid, dateKey)) return
  try {
    await kvSet(overlayKey(uid, dateKey), { ...data, cachedAt: Date.now() })
  } catch { /* best effort */ }
}

export async function getNutritionOverlayCache(
  uid: string,
  dateKey: string,
): Promise<NutritionOverlayCache | null> {
  if (!ok(uid, dateKey)) return null
  try {
    const v = await kvGet(overlayKey(uid, dateKey))
    return v && typeof v === 'object' ? (v as NutritionOverlayCache) : null
  } catch {
    return null
  }
}

export async function setNutritionMealsCache(
  uid: string,
  dateKey: string,
  data: Omit<NutritionMealsCache, 'cachedAt'>,
): Promise<void> {
  if (!ok(uid, dateKey)) return
  try {
    await kvSet(mealsKey(uid, dateKey), { ...data, cachedAt: Date.now() })
  } catch { /* best effort */ }
}

export async function getNutritionMealsCache(
  uid: string,
  dateKey: string,
): Promise<NutritionMealsCache | null> {
  if (!ok(uid, dateKey)) return null
  try {
    const v = await kvGet(mealsKey(uid, dateKey))
    return v && typeof v === 'object' ? (v as NutritionMealsCache) : null
  } catch {
    return null
  }
}

/** Biblioteca do usuário (custom foods) pro parser reconhecer offline. */
export async function setCustomFoodsCache(uid: string, foods: unknown): Promise<void> {
  if (!ok(uid)) return
  try {
    await kvSet(customFoodsKey(uid), Array.isArray(foods) ? foods : [])
  } catch { /* best effort */ }
}

export async function getCustomFoodsCache(uid: string): Promise<Array<Record<string, unknown>>> {
  if (!ok(uid)) return []
  try {
    const v = await kvGet(customFoodsKey(uid))
    return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []
  } catch {
    return []
  }
}

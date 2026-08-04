/**
 * mealItemFoods — o repertório REAL do usuário, extraído dos itens das refeições.
 *
 * Por que não usar `nutrition_learned_foods`: ela guarda o que o usuário DIGITOU no
 * lançamento, e ele digita refeição inteira. Medido na conta do dono em 03/08/2026:
 * dos 42 "alimentos aprendidos", **1** servia como substituto. Os outros 41 eram
 * composto ("Pão Francês com Doce de Leite"), refeição ("Refeição de Arroz,
 * Strogonoff e Batata Palha", 1070 kcal/100 g — o total gravado no campo per_100g)
 * ou traziam a quantidade no nome ("50g de Whey Protein").
 *
 * `nutrition_meal_entries.items` é a MESMA comida já quebrada em itens pelo parser,
 * com gramas e macros absolutos:
 *
 *   {"label": "150g arroz", "grams": 150, "calories": 231, "protein": 16, …}
 *
 * Daí sai o que a troca precisa: o nome do alimento sem a quantidade ("arroz") e os
 * macros por 100 g calculados a partir de gramas reais — não um campo per_100g que
 * ninguém garantiu.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isUsableAsSwapCandidate } from './foodItemSanity'
import { buildFoodMealMap, type FoodMealMap } from './mealContext'
import type { SwapCandidate } from './foodSwap'

const LOOKBACK_DAYS = 90
const MAX_ENTRIES = 400

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Tira a quantidade da frente do label: "150g arroz" → "arroz", "400ml leite
 * integral" → "leite integral", "1 esfirra de carne" → "esfirra de carne".
 *
 * Só remove no COMEÇO: "arroz 150g" é raro e "pão de 50g" perderia sentido se o
 * corte fosse no meio. O que sobrar ainda passa pelo crivo de `foodItemSanity`.
 */
export function stripQuantityPrefix(label: string): string {
  return String(label ?? '')
    .trim()
    .replace(/^\d+[.,]?\d*\s*(g|kg|ml|l|un|unid|unidades?|fatias?|colheres?|copos?|latas?|porções?|porcoes?)\b\s*(de\s+)?/i, '')
    .replace(/^\d+[.,]?\d*\s+/, '')
    .trim()
}

/** Macros por 100 g a partir da porção real do item. */
function toPer100g(item: Record<string, unknown>): { kcal: number; protein: number; carbs: number; fat: number } | null {
  const grams = num(item.grams)
  if (grams <= 0) return null
  const factor = 100 / grams
  return {
    kcal: num(item.calories) * factor,
    protein: num(item.protein) * factor,
    carbs: num(item.carbs) * factor,
    fat: num(item.fat) * factor,
  }
}

/**
 * Extrai candidatos dos itens já lançados. Pura — a leitura fica na função abaixo,
 * então dá pra testar a extração inteira sem banco.
 */
export function candidatesFromMealRows(rows: unknown[]): SwapCandidate[] {
  const byKey = new Map<string, { candidate: SwapCandidate; seen: number }>()

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isRecord(row)) continue
    const items = Array.isArray(row.items) ? row.items : []
    for (const raw of items) {
      if (!isRecord(raw)) continue
      const name = stripQuantityPrefix(String(raw.label ?? ''))
      if (!name) continue
      const per100 = toPer100g(raw)
      if (!per100) continue

      const candidate: SwapCandidate = { name: name.slice(0, 60), ...per100, source: 'learned' }
      if (!isUsableAsSwapCandidate(candidate)) continue

      const key = name.toLowerCase()
      const existing = byKey.get(key)
      if (existing) {
        existing.seen += 1
        continue
      }
      byKey.set(key, { candidate, seen: 1 })
    }
  }

  // Mais frequentes primeiro: o que o usuário come toda semana vem antes do que
  // comeu uma vez. `swapFood` reordena por desvio calórico dentro da mesma fonte,
  // mas essa ordem decide o corte quando há muito candidato.
  return [...byKey.values()]
    .sort((a, b) => b.seen - a.seen)
    .map((x) => x.candidate)
    .slice(0, 60)
}

/** Refeições recentes cruas — base do repertório E do mapa de adequação. */
async function readRecentMealRows(supabase: SupabaseClient, userId: string): Promise<unknown[]> {
  const uid = String(userId || '').trim()
  if (!uid) return []
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  try {
    const { data } = await supabase
      .from('nutrition_meal_entries')
      .select('food_name, items')
      .eq('user_id', uid)
      .gte('date', since)
      .not('items', 'is', null)
      .order('date', { ascending: false })
      .limit(MAX_ENTRIES)
    return Array.isArray(data) ? data : []
  } catch {
    // Repertório vazio degrada pra base curada — melhor que derrubar a troca.
    return []
  }
}

/** Lê as refeições recentes e devolve os alimentos individuais do usuário. */
export async function buildMealItemFoods(supabase: SupabaseClient, userId: string): Promise<SwapCandidate[]> {
  return candidatesFromMealRows(await readRecentMealRows(supabase, userId))
}

/** Mapa alimento → grupos de refeição, da mesma leitura (ver `mealContext`). */
export async function buildUserFoodMealMap(supabase: SupabaseClient, userId: string): Promise<FoodMealMap> {
  return buildFoodMealMap(await readRecentMealRows(supabase, userId), stripQuantityPrefix)
}

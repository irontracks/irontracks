/**
 * Resolve um texto digitado ("150g arroz") em item(s) com macros — extraído de
 * `NutritionMixer.tsx` (22/09/2026) para ser reusado também no editor do
 * plano alimentar (`MyDietPlan.tsx`), que precisava da MESMA cadeia. Antes
 * era função local do Mixer; duplicá-la teria repetido a fiação de três
 * fallbacks em dois lugares — exatamente o padrão que já custou caro aqui
 * (14 renderers de série reimplementando a mesma coisa).
 *
 * Ordem: parser local (base + biblioteca do usuário, instantâneo) →
 * `resolveFoodItemsAction` (servidor: TACO/OFF/aprendido/biblioteca) → IA
 * (VIP), só se o passo anterior sinalizar `needsAi`. Offline usa só o
 * parser local.
 */
import { resolveFoodItemsAction, estimateFoodAction } from '@/app/app/(app)/dashboard/nutrition/actions'
import { analyzeMeal } from './parser'
import { customFoodsToExtraFoods, type CustomFood } from '@/components/dashboard/nutrition/useCustomFoods'
import type { MealItem } from './engine'

export type ResolveFoodResult =
  | { ok: true; items: MealItem[] }
  | { ok: false; error?: string; needsAi?: boolean }

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

export async function resolveFoodForEditor(text: string, customFoods: readonly CustomFood[]): Promise<ResolveFoodResult> {
  const t = String(text || '').trim()
  if (!t) return { ok: false, error: 'Digite um alimento.' }

  // 1. parser local (instantâneo)
  try {
    const extra = customFoodsToExtraFoods(Array.isArray(customFoods) ? [...customFoods] : [])
    const a = analyzeMeal(t, extra)
    if (a.items.length > 0 && a.unknownLines.length === 0) {
      return { ok: true, items: a.items.map((it) => ({ label: it.label, grams: it.grams, calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat })) }
    }
  } catch { /* cai pro servidor */ }

  if (isOffline()) return { ok: false, error: 'Sem internet pra reconhecer esse alimento.' }

  // 2. servidor: resolveFood (base/TACO/learned/custom/OFF)
  try {
    const res = await resolveFoodItemsAction(t)
    if (res?.ok && Array.isArray(res.items) && res.items.length > 0) {
      return { ok: true, items: res.items as MealItem[] }
    }
    if (!(res as Record<string, unknown>)?.needsAi) {
      return { ok: false, error: String((res as Record<string, unknown>)?.error || 'Não reconheci esse alimento.') }
    }
  } catch { /* tenta IA */ }

  // 3. IA (VIP)
  try {
    const ai = await estimateFoodAction(t)
    const aiObj = ai as Record<string, unknown>
    if (ai?.ok && aiObj?.item) {
      return { ok: true, items: [aiObj.item as MealItem] }
    }
    const upgrade = Boolean(aiObj?.upgradeRequired) || String(aiObj?.error || '') === 'vip_required'
    return { ok: false, error: upgrade ? 'Estimativa por IA é do plano VIP.' : 'Não reconheci esse alimento.' }
  } catch {
    return { ok: false, error: 'Falha ao adicionar.' }
  }
}

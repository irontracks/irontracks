import { getErrorMessage } from '@/utils/errorMessage'
import { logWarn } from '@/lib/logger'

// Funções PURAS de cálculo (BMR/TDEE/macros) vivem em ./goals — sem dependência de
// servidor, pra poderem ser importadas no client sem puxar supabase/server (que
// importa next/headers) pro bundle. Re-exportadas aqui por compatibilidade com quem
// já importa de '@/lib/nutrition/engine'.
export {
  getActivityMultiplier,
  calculateBMR,
  calculateTDEE,
  calculateMacros,
  calculateNutritionGoals,
} from './goals'
export type { Gender, ActivityLevel, UserStats, Goal } from './goals'

export interface MealLog {
  foodName: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type MealItem = {
  label: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

export async function trackMeal(userId: string, meal: MealLog, dateKey?: string, items?: MealItem[] | null, clientId?: string | null): Promise<Record<string, unknown> | null> {
  try {
    const safeUserId = typeof userId === 'string' ? userId.trim() : ''
    if (!safeUserId) throw new Error('nutrition_invalid_user_id')
    if (!meal) throw new Error('nutrition_invalid_meal')

    const foodName = typeof meal.foodName === 'string' ? meal.foodName.trim() : ''
    if (!foodName) throw new Error('nutrition_invalid_meal_food_name')

    let calories = Number(meal.calories)
    let protein = Number(meal.protein)
    let carbs = Number(meal.carbs)
    let fat = Number(meal.fat)

    if (!Number.isFinite(calories) || calories < 0) throw new Error('nutrition_invalid_meal_calories')
    if (!Number.isFinite(protein) || protein < 0) throw new Error('nutrition_invalid_meal_protein')
    if (!Number.isFinite(carbs) || carbs < 0) throw new Error('nutrition_invalid_meal_carbs')
    if (!Number.isFinite(fat) || fat < 0) throw new Error('nutrition_invalid_meal_fat')

    // Teto sanitário — mesmos limites da rota /api/nutrition/log-entry. trackMeal é o
    // funil ÚNICO de escrita (todas as Server Actions e a rota passam por aqui), então
    // clampar aqui cobre logMealAction/applyGeneratedMealAction/logBarcodeAction de uma
    // vez. Sem isto, uma action podia gravar macros absurdos (ex.: 1e12) que inflam o
    // agregado do dia — daily_nutrition_logs não tem CHECK de range no banco.
    calories = Math.min(6000, calories)
    protein = Math.min(400, protein)
    carbs = Math.min(800, carbs)
    fat = Math.min(300, fat)

    if (typeof window !== 'undefined') throw new Error('nutrition_track_meal_server_only')

    const resolvedDateKey = typeof dateKey === 'string' ? dateKey.trim() : ''
    if (!resolvedDateKey) throw new Error('nutrition_invalid_date')

    const { createClient } = await import('../../utils/supabase/server')
    const supabase = await createClient()

    // Breakdown por item (nome + gramas + macros), salvo em `items` (jsonb) para
    // o card expandido mostrar os alimentos. Null quando não há detalhamento.
    const safeItems = Array.isArray(items) && items.length > 0
      ? items.map((it) => ({
          label: String(it?.label ?? '').slice(0, 120),
          grams: Math.max(0, Math.round(Number(it?.grams) || 0)),
          calories: Math.max(0, Math.round(Number(it?.calories) || 0)),
          protein: Math.max(0, Math.round(Number(it?.protein) || 0)),
          carbs: Math.max(0, Math.round(Number(it?.carbs) || 0)),
          fat: Math.max(0, Math.round(Number(it?.fat) || 0)),
        }))
      : null

    // client_id = uuid otimista da fila offline. Presente → o insert é idempotente
    // (índice único parcial user_id+client_id): um reenvio do mesmo lançamento
    // (resposta perdida após o commit) NÃO duplica. Ausente → insere normal.
    const cid = typeof clientId === 'string' && clientId.trim() ? clientId.trim().slice(0, 64) : null

    // 1. Insert the meal entry directly (bypassing broken RPC)
    const insertRes = await supabase
      .from('nutrition_meal_entries')
      .insert({
        user_id: safeUserId,
        date: resolvedDateKey,
        food_name: foodName,
        calories,
        protein,
        carbs,
        fat,
        items: safeItems,
        client_id: cid,
      })
      .select('id, created_at, food_name, calories, protein, carbs, fat, items')
      .single()

    let insertedEntry = insertRes.data
    if (insertRes.error) {
      // 23505 = unique_violation: reenvio idempotente do mesmo lançamento offline.
      // Busca a linha já gravada e segue como sucesso — sem duplicar nem inflar os
      // totais do dia. (Só ocorre com cid != null; sem clientId, seria insert normal.)
      if (cid && (insertRes.error as { code?: string }).code === '23505') {
        const { data: existing } = await supabase
          .from('nutrition_meal_entries')
          .select('id, created_at, food_name, calories, protein, carbs, fat, items')
          .eq('user_id', safeUserId)
          .eq('client_id', cid)
          .maybeSingle()
        insertedEntry = existing ?? null
      } else {
        throw new Error(insertRes.error.message || 'nutrition_insert_entry_failed')
      }
    }

    // 2. Recalculate daily totals from all entries for this date
    const { data: allEntries, error: sumError } = await supabase
      .from('nutrition_meal_entries')
      .select('calories, protein, carbs, fat')
      .eq('user_id', safeUserId)
      .eq('date', resolvedDateKey)

    if (sumError) throw new Error(sumError.message || 'nutrition_sum_entries_failed')

    const entriesList = Array.isArray(allEntries) ? allEntries : []
    const totalCalories = entriesList.reduce((sum, e) => sum + (Number((e as Record<string, unknown>)?.calories) || 0), 0)
    const totalProtein = entriesList.reduce((sum, e) => sum + (Number((e as Record<string, unknown>)?.protein) || 0), 0)
    const totalCarbs = entriesList.reduce((sum, e) => sum + (Number((e as Record<string, unknown>)?.carbs) || 0), 0)
    const totalFat = entriesList.reduce((sum, e) => sum + (Number((e as Record<string, unknown>)?.fat) || 0), 0)

    // 3. Upsert daily_nutrition_logs with new totals
    const { error: upsertError } = await supabase
      .from('daily_nutrition_logs')
      .upsert(
        {
          user_id: safeUserId,
          date: resolvedDateKey,
          calories: Math.round(totalCalories),
          protein: Math.round(totalProtein),
          carbs: Math.round(totalCarbs),
          fat: Math.round(totalFat),
        },
        { onConflict: 'user_id,date' }
      )

    if (upsertError) {
      // Non-fatal: entry was saved, daily log update failed
      // Log but don't throw — the entry is already persisted
      logWarn('nutrition:engine', 'daily_nutrition_logs upsert failed', upsertError.message)
    }

    // Return shape matching what NutritionMixer expects
    return {
      entry_id: insertedEntry?.id ?? '',
      id: insertedEntry?.id ?? '',
      created_at: insertedEntry?.created_at ?? new Date().toISOString(),
      food_name: insertedEntry?.food_name ?? foodName,
      calories,
      protein,
      carbs,
      fat,
      items: insertedEntry?.items ?? safeItems,
      totals_calories: Math.round(totalCalories),
      totals_protein: Math.round(totalProtein),
      totals_carbs: Math.round(totalCarbs),
      totals_fat: Math.round(totalFat),
    }
  } catch (e: unknown) {
    throw new Error(getErrorMessage(e) || 'nutrition_track_meal_failed')
  }
}

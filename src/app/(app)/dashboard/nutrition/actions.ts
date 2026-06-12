'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { trackMeal } from '@/lib/nutrition/engine'
import { resolveFood } from '@/lib/nutrition/food-resolver'
import { getErrorMessage } from '@/utils/errorMessage'
import { resolveBarcode } from '@/lib/nutrition/barcode-resolver'
import { sanitizeFoodName } from '@/lib/nutrition/security'
import { insertNotifications, shouldThrottleBySenderType } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'
import { waitUntil } from '@vercel/functions'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fire-and-forget self push when the user crosses their daily calorie or
 * protein goal for the first time today. Throttled 24h per type so even
 * with multiple meals we only celebrate once.
 */
async function maybeNotifyDailyGoal(
  supabase: SupabaseClient,
  userId: string,
  dateKey: string,
): Promise<void> {
  try {
    const [{ data: goalRow }, { data: logRow }] = await Promise.all([
      supabase.from('nutrition_goals').select('calories, protein').eq('user_id', userId).maybeSingle(),
      supabase.from('daily_nutrition_logs').select('calories, protein').eq('user_id', userId).eq('date', dateKey).maybeSingle(),
    ])
    const calGoal = Number(goalRow?.calories) || 0
    const protGoal = Number(goalRow?.protein) || 0
    const calNow = Number(logRow?.calories) || 0
    const protNow = Number(logRow?.protein) || 0

    const calHit = calGoal > 0 && calNow >= calGoal
    const protHit = protGoal > 0 && protNow >= protGoal
    if (!calHit && !protHit) return

    const throttled = await shouldThrottleBySenderType(userId, 'daily_goal_hit', 24 * 60).catch(() => true)
    if (throttled) return

    const message = calHit && protHit
      ? `Meta diária batida: ${Math.round(calNow)} kcal e ${Math.round(protNow)}g de proteína. 🎯`
      : calHit
        ? `Meta de ${calGoal} kcal atingida hoje. 🎯`
        : `Meta de ${protGoal}g de proteína atingida hoje. 💪`

    await insertNotifications([{
      user_id: userId,
      recipient_id: userId,
      sender_id: userId,
      type: 'daily_goal_hit',
      title: 'Meta diária atingida',
      message,
      is_read: false,
      metadata: { calories: calNow, protein: protNow, calories_goal: calGoal, protein_goal: protGoal, date: dateKey },
    }])
  } catch (e) {
    logError('nutrition.maybeNotifyDailyGoal', e)
  }
}

export async function logMealAction(mealText: string, dateKey?: string, mealName?: string) {
  try {
    const normalizedText = String(mealText ?? '').trim()
    if (!normalizedText) return { ok: false, error: 'Texto vazio.' }
    if (normalizedText.length > 500) return { ok: false, error: 'Texto muito longo.' }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const resolvedDateKey = (() => {
      const s = typeof dateKey === 'string' ? dateKey.trim() : ''
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      try {
        const tz = 'America/Sao_Paulo'
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      } catch {
        return new Date().toISOString().slice(0, 10)
      }
    })()

    // Try food-resolver first (local → TACO → learned → OFF)
    const resolved = await resolveFood(supabase, userId, normalizedText)

    if (resolved) {
      const customName = String(mealName ?? '').trim()
      const meal = customName
        ? { ...resolved.meal, foodName: sanitizeFoodName(customName).slice(0, 120) || resolved.meal.foodName }
        : resolved.meal
      const row = await trackMeal(userId, meal, resolvedDateKey, resolved.items)
      revalidatePath('/dashboard/nutrition')
      waitUntil(maybeNotifyDailyGoal(supabase, userId, resolvedDateKey))
      return { ok: true, meal, entry: row || null }
    }

    // Nothing resolved → signal client to call AI
    return {
      ok: false,
      error: `nutrition_parser_unknown_food:${normalizedText}`,
      needsAi: true,
    }
  } catch (e: unknown) {
    const message = String(getErrorMessage(e) || '')
    const looksLikeMissingTable =
      message.toLowerCase().includes('could not find the table') ||
      message.toLowerCase().includes('schema cache') ||
      message.toLowerCase().includes('nutrition_meal_entries')
    if (looksLikeMissingTable) {
      return { ok: false, error: 'Banco de dados de nutrição não configurado.' }
    }
    return { ok: false, error: message || 'nutrition_log_meal_failed' }
  }
}

export async function deleteMealAction(entryId: string) {
  try {
    const id = String(entryId ?? '').trim()
    if (!id) return { ok: false, error: 'ID inválido.' }

    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'nutrition_auth_failed')
    const userId = authData?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    // Fetch entry to know the date before deleting
    const { data: entry } = await supabase
      .from('nutrition_meal_entries')
      .select('date')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    const { error } = await supabase
      .from('nutrition_meal_entries')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) throw error

    // Recalculate totals for the date
    let totals = null
    if (entry?.date) {
      const { data: remaining } = await supabase
        .from('nutrition_meal_entries')
        .select('calories, protein, carbs, fat')
        .eq('user_id', userId)
        .eq('date', entry.date)

      const rows = Array.isArray(remaining) ? remaining : []
      totals = {
        calories: rows.reduce((s, r) => s + (Number(r?.calories) || 0), 0),
        protein: rows.reduce((s, r) => s + (Number(r?.protein) || 0), 0),
        carbs: rows.reduce((s, r) => s + (Number(r?.carbs) || 0), 0),
        fat: rows.reduce((s, r) => s + (Number(r?.fat) || 0), 0),
      }
    }

    revalidatePath('/dashboard/nutrition')
    return { ok: true, totals }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_delete_meal_failed') }
  }
}

export async function editMealAction(
  entryId: string,
  draft: { food_name: string; calories: number; protein: number; carbs: number; fat: number },
) {
  try {
    const id = String(entryId ?? '').trim()
    if (!id) return { ok: false, error: 'ID inválido.' }

    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'nutrition_auth_failed')
    const userId = authData?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const { data: updated, error } = await supabase
      .from('nutrition_meal_entries')
      .update({
        food_name: String(draft.food_name ?? '').trim() || 'Refeição',
        calories: Math.max(0, Number(draft.calories) || 0),
        protein: Math.max(0, Number(draft.protein) || 0),
        carbs: Math.max(0, Number(draft.carbs) || 0),
        fat: Math.max(0, Number(draft.fat) || 0),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select('date')
      .maybeSingle()

    if (error) throw error

    // Recalculate totals for the date
    let totals = null
    if (updated?.date) {
      const { data: all } = await supabase
        .from('nutrition_meal_entries')
        .select('calories, protein, carbs, fat')
        .eq('user_id', userId)
        .eq('date', updated.date)

      const rows = Array.isArray(all) ? all : []
      totals = {
        calories: rows.reduce((s, r) => s + (Number(r?.calories) || 0), 0),
        protein: rows.reduce((s, r) => s + (Number(r?.protein) || 0), 0),
        carbs: rows.reduce((s, r) => s + (Number(r?.carbs) || 0), 0),
        fat: rows.reduce((s, r) => s + (Number(r?.fat) || 0), 0),
      }
    }

    revalidatePath('/dashboard/nutrition')
    return { ok: true, totals }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_edit_meal_failed') }
  }
}

/**
 * Applies one meal from an AI-generated diet plan as a single entry.
 * Macros are already computed server-side by /api/ai/diet-generate; here we
 * just validate, clamp and persist via the shared trackMeal flow so totals
 * and daily logs stay consistent.
 */
export async function applyGeneratedMealAction(
  meal: { name: string; calories: number; protein: number; carbs: number; fat: number },
  dateKey?: string,
) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const resolvedDateKey = (() => {
      const s = typeof dateKey === 'string' ? dateKey.trim() : ''
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      try {
        const tz = 'America/Sao_Paulo'
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      } catch {
        return new Date().toISOString().slice(0, 10)
      }
    })()

    const mealLog = {
      foodName: sanitizeFoodName(String(meal?.name ?? '')).slice(0, 120) || 'Refeição',
      calories: Math.max(0, Math.round(Number(meal?.calories) || 0)),
      protein: Math.max(0, Math.round(Number(meal?.protein) || 0)),
      carbs: Math.max(0, Math.round(Number(meal?.carbs) || 0)),
      fat: Math.max(0, Math.round(Number(meal?.fat) || 0)),
    }
    if (mealLog.calories <= 0 && mealLog.protein <= 0) return { ok: false, error: 'Refeição vazia.' }

    const row = await trackMeal(userId, mealLog, resolvedDateKey)
    revalidatePath('/dashboard/nutrition')
    waitUntil(maybeNotifyDailyGoal(supabase, userId, resolvedDateKey))
    return { ok: true, meal: mealLog, entry: row || null }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_apply_generated_meal_failed') }
  }
}

/** Persists the day's water intake (ml) in daily_nutrition_logs. */
export async function updateWaterAction(ml: number, dateKey?: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const resolvedDateKey = (() => {
      const s = typeof dateKey === 'string' ? dateKey.trim() : ''
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      try {
        const tz = 'America/Sao_Paulo'
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      } catch {
        return new Date().toISOString().slice(0, 10)
      }
    })()

    const safeMl = Math.max(0, Math.min(10000, Math.round(Number(ml) || 0)))
    const { error: upsertError } = await supabase
      .from('daily_nutrition_logs')
      .upsert({ user_id: userId, date: resolvedDateKey, water_ml: safeMl, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' })
    if (upsertError) throw upsertError
    return { ok: true, water_ml: safeMl }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_water_failed') }
  }
}

/**
 * Copia um produto resolvido pelo Open Food Facts para a biblioteca do usuário,
 * associado ao EAN. Assim a próxima leitura do mesmo código é instantânea (vem
 * da biblioteca) e o produto passa a ser reconhecido na simulação por nome.
 * Não-fatal: qualquer erro (limite de 50, etc.) não impede o lançamento.
 */
async function saveScannedProductToLibrary(
  supabase: SupabaseClient,
  userId: string,
  ean: string,
  name: string,
  item: { kcal: number; p: number; c: number; f: number },
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('nutrition_custom_foods')
      .select('id')
      .eq('user_id', userId)
      .eq('barcode', ean)
      .limit(1)
      .maybeSingle()
    if (existing) return

    await supabase.from('nutrition_custom_foods').insert({
      user_id: userId,
      name: sanitizeFoodName(name).slice(0, 120) || 'Produto',
      aliases: [],
      barcode: ean,
      serving_size_g: 100,
      kcal_per100g: Math.max(0, Math.round(item.kcal)),
      protein_per100g: Math.max(0, Math.round(item.p)),
      carbs_per100g: Math.max(0, Math.round(item.c)),
      fat_per100g: Math.max(0, Math.round(item.f)),
      fiber_per100g: 0,
      updated_at: new Date().toISOString(),
    })
  } catch {
    /* non-fatal */
  }
}

export async function logBarcodeAction(ean: string, grams: number, dateKey?: string) {
  try {
    const cleanEan = String(ean ?? '').trim()
    if (!cleanEan) return { ok: false, error: 'Código de barras inválido.' }

    const safeGrams = Number(grams)
    if (!Number.isFinite(safeGrams) || safeGrams <= 0 || safeGrams > 5000) {
      return { ok: false, error: 'Quantidade inválida.' }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const resolvedDateKey = (() => {
      const s = typeof dateKey === 'string' ? dateKey.trim() : ''
      if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      try {
        const tz = 'America/Sao_Paulo'
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
      } catch {
        return new Date().toISOString().slice(0, 10)
      }
    })()

    const resolved = await resolveBarcode(supabase, cleanEan, userId)
    if (!resolved) {
      // Sinaliza ao cliente pra abrir o scanner da tabela nutricional já com o EAN.
      return { ok: false, error: 'Produto não encontrado.', notFound: true, ean: cleanEan }
    }

    // Achou via OFF → copia pra biblioteca com o EAN (próxima leitura é instantânea).
    if (resolved.source === 'off') {
      await saveScannedProductToLibrary(supabase, userId, cleanEan, resolved.name, resolved.item)
    }

    const multiplier = safeGrams / 100
    const meal = {
      foodName: sanitizeFoodName(resolved.name).slice(0, 120) || 'Produto',
      calories: Math.round(resolved.item.kcal * multiplier),
      protein: Math.round(resolved.item.p * multiplier),
      carbs: Math.round(resolved.item.c * multiplier),
      fat: Math.round(resolved.item.f * multiplier),
    }

    const row = await trackMeal(userId, meal, resolvedDateKey, [{
      label: `${Math.round(safeGrams)}g ${meal.foodName}`,
      grams: Math.round(safeGrams),
      calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat,
    }])
    revalidatePath('/dashboard/nutrition')
    waitUntil(maybeNotifyDailyGoal(supabase, userId, resolvedDateKey))
    return { ok: true, meal, entry: row || null }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_log_barcode_failed') }
  }
}

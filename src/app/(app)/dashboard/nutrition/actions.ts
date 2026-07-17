'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { trackMeal } from '@/lib/nutrition/engine'
import { resolveFood } from '@/lib/nutrition/food-resolver'
import { getErrorMessage } from '@/utils/errorMessage'
import { resolveBarcode } from '@/lib/nutrition/barcode-resolver'
import { sanitizeFoodName } from '@/lib/nutrition/security'
import { deleteEntryCore, editEntryCore, setWaterCore, resolveDateKey, type MealDraft } from '@/lib/nutrition/mutations'
import { insertNotifications, shouldThrottleBySenderType } from '@/lib/social/notifyFollowers'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { saveLearnedFood } from '@/lib/nutrition/learned-foods'
import { estimateMacrosFromText } from '@/lib/nutrition/aiEstimate'
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
    // Só celebra a meta do DIA CORRENTE. Um lançamento retroativo (backdate:
    // "esqueci de lançar ontem") não pode disparar push "Meta atingida hoje 🎯"
    // com data passada — o texto é hardcoded "hoje" e a metadata levaria a data
    // errada. resolveDateKey() sem argumento = hoje (fuso de São Paulo).
    if (dateKey !== resolveDateKey()) return

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

    const resolvedDateKey = resolveDateKey(dateKey)

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

    const { totals } = await deleteEntryCore(supabase, userId, id)

    revalidatePath('/dashboard/nutrition')
    return { ok: true, totals }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_delete_meal_failed') }
  }
}

export async function editMealAction(
  entryId: string,
  draft: MealDraft,
) {
  try {
    const id = String(entryId ?? '').trim()
    if (!id) return { ok: false, error: 'ID inválido.' }

    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) throw new Error(authError.message || 'nutrition_auth_failed')
    const userId = authData?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const { totals } = await editEntryCore(supabase, userId, id, draft)

    revalidatePath('/dashboard/nutrition')
    return { ok: true, totals }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_edit_meal_failed') }
  }
}

/**
 * Resolve UM alimento (texto → item(s)) SEM persistir, pra adicionar dentro do
 * editor de uma refeição. Usa o mesmo pipeline do lançamento (local→TACO→
 * learned→custom→OFF). Se nada resolver, sinaliza needsAi pro cliente estimar.
 */
export async function resolveFoodItemsAction(text: string) {
  try {
    const normalized = String(text ?? '').trim()
    if (!normalized) return { ok: false, error: 'Texto vazio.' }
    if (normalized.length > 200) return { ok: false, error: 'Texto muito longo.' }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const resolved = await resolveFood(supabase, userId, normalized)
    if (resolved && Array.isArray(resolved.items) && resolved.items.length > 0) {
      const items = resolved.items.map((it) => ({
        label: String(it?.label ?? '').slice(0, 120),
        grams: Math.max(0, Math.round(Number(it?.grams) || 0)),
        calories: Math.max(0, Math.round(Number(it?.calories) || 0)),
        protein: Math.max(0, Math.round(Number(it?.protein) || 0)),
        carbs: Math.max(0, Math.round(Number(it?.carbs) || 0)),
        fat: Math.max(0, Math.round(Number(it?.fat) || 0)),
      }))
      return { ok: true, items }
    }
    return { ok: false, needsAi: true }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_resolve_food_failed') }
  }
}

/**
 * Estima macros de UM alimento com IA (VIP), SEM persistir — usado quando o
 * parser/base não reconhece o alimento no editor. Retorna 1 item (grams=0,
 * label = o texto digitado) e aprende o alimento pra próxima.
 */
export async function estimateFoodAction(text: string) {
  try {
    const normalized = String(text ?? '').trim()
    if (!normalized) return { ok: false, error: 'Texto vazio.' }
    if (normalized.length > 200) return { ok: false, error: 'Texto muito longo.' }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    // Server Action = endpoint POST invocável direto. Sem rate-limit + metering,
    // um loop consome Gemini (pago) ilimitado — a rota irmã /api/ai/nutrition-estimate
    // já tem os dois. Rate-limit por usuário (Action não recebe `req`/IP).
    const rl = await checkRateLimitAsync(`ai:estimate-food:${userId}`, 10, 60_000)
    if (!rl.allowed) return { ok: false, error: 'rate_limited' }

    // { meter: true } consome o teto anti-abuso nutrition_macros (200/dia), igual à rota.
    const access = await checkVipFeatureAccess(supabase, userId, 'nutrition_macros', { meter: true })
    if (!access.allowed) return { ok: false, error: 'vip_required', upgradeRequired: true }

    const out = await estimateMacrosFromText(normalized)
    if (!out) return { ok: false, error: 'invalid_ai_output' }

    // Auto-learn: próxima vez o parser local reconhece sem IA.
    try {
      await saveLearnedFood(supabase, userId, normalized, out.foodName, out.calories, out.protein, out.carbs, out.fat)
    } catch { /* não-fatal */ }

    const item = {
      label: normalized.slice(0, 120),
      grams: 0,
      calories: Math.round(out.calories),
      protein: Math.round(out.protein),
      carbs: Math.round(out.carbs),
      fat: Math.round(out.fat),
    }
    return { ok: true, item }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_estimate_food_failed') }
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

    const resolvedDateKey = resolveDateKey(dateKey)

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

/**
 * Lança a refeição que o CHAT simulou — persistindo EXATAMENTE os items que o card
 * mostrou.
 *
 * ── Por que não reusa o logMealAction (que seria o reuso óbvio) ────────────────
 * Porque ele RE-RESOLVE o texto. O chat já resolveu: se a cascata falhou e caiu no
 * Gemini, o logMealAction falharia de novo, devolveria `needsAi` e o cliente cairia
 * em /api/ai/nutrition-estimate → NOVA amostra do modelo → OUTRO número. O card
 * prometeria 390 kcal e o diário gravaria 412. O app se contradiria em dois toques,
 * metrando a cota 2× e gastando 3 chamadas de IA no lugar de 1.
 *
 * ── Sobre confiar em número vindo do cliente ──────────────────────────────────
 * É o mesmo modelo de confiança do applyGeneratedMealAction logo acima (dieta
 * gerada), que também recebe macros do cliente e confia nos clamps do trackMeal
 * (funil ÚNICO de escrita, tetos 6000/400/800/300). E o usuário já pode editar os
 * próprios macros pelo editEntryCore. Não há dado de terceiro, não há vantagem em
 * mentir pra si mesmo, e a alternativa (assinar a simulação) exigiria HMAC e cache
 * que o repo não tem — infra nova pra proteger o usuário dele mesmo.
 *
 * Guard trava a ausência de resolveFood/estimateMacrosFromText aqui.
 */
export async function applyChatSimulationAction(
  sim: {
    foodText: string
    items: Array<{ label: string; grams: number; calories: number; protein: number; carbs: number; fat: number }>
  },
  dateKey?: string,
  clientId?: string,
) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const resolvedDateKey = resolveDateKey(dateKey)

    const items = (Array.isArray(sim?.items) ? sim.items : []).slice(0, 20).map((it) => ({
      label: sanitizeFoodName(String(it?.label ?? '')).slice(0, 120) || 'Item',
      grams: Math.max(0, Number(it?.grams) || 0),
      calories: Math.max(0, Number(it?.calories) || 0),
      protein: Math.max(0, Number(it?.protein) || 0),
      carbs: Math.max(0, Number(it?.carbs) || 0),
      fat: Math.max(0, Number(it?.fat) || 0),
    }))
    if (!items.length) return { ok: false, error: 'Nada pra lançar.' }

    // Os totais são a SOMA dos items — os mesmos que o card exibiu. Não arredonda
    // aqui: o trackMeal grava a refeição crua e arredonda o total do dia (uma única
    // passada), que é o que a projeção do card replicou. Ver chatProjection.ts.
    const mealLog = {
      foodName: sanitizeFoodName(String(sim?.foodText ?? '')).slice(0, 120) || 'Refeição',
      calories: items.reduce((s, i) => s + i.calories, 0),
      protein: items.reduce((s, i) => s + i.protein, 0),
      carbs: items.reduce((s, i) => s + i.carbs, 0),
      fat: items.reduce((s, i) => s + i.fat, 0),
    }
    if (mealLog.calories <= 0 && mealLog.protein <= 0) return { ok: false, error: 'Refeição vazia.' }

    const row = await trackMeal(userId, mealLog, resolvedDateKey, items, clientId ?? null)
    revalidatePath('/dashboard/nutrition')
    waitUntil(maybeNotifyDailyGoal(supabase, userId, resolvedDateKey))
    return { ok: true, entry: row || null }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_apply_chat_simulation_failed') }
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

    const resolvedDateKey = resolveDateKey(dateKey)

    const { water_ml } = await setWaterCore(supabase, userId, ml, resolvedDateKey)
    return { ok: true, water_ml }
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

/**
 * Resolve um código de barras SEM lançar — usado pelo scanner da biblioteca pra
 * pré-preencher o formulário a partir do produto (biblioteca do usuário ou OFF).
 */
export async function lookupBarcodeAction(ean: string) {
  try {
    const cleanEan = String(ean ?? '').trim()
    if (!cleanEan) return { ok: false, error: 'Código inválido.' }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error(error.message || 'nutrition_auth_failed')
    const userId = data?.user?.id
    if (!userId) throw new Error('nutrition_unauthorized')

    const resolved = await resolveBarcode(supabase, cleanEan, userId)
    if (!resolved) return { ok: true, found: false, ean: cleanEan }

    return {
      ok: true,
      found: true,
      ean: cleanEan,
      name: resolved.name,
      kcal: Math.max(0, Math.round(resolved.item.kcal)),
      protein: Math.max(0, Math.round(resolved.item.p)),
      carbs: Math.max(0, Math.round(resolved.item.c)),
      fat: Math.max(0, Math.round(resolved.item.f)),
    }
  } catch (e: unknown) {
    return { ok: false, error: String(getErrorMessage(e) || 'nutrition_lookup_barcode_failed') }
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

    const resolvedDateKey = resolveDateKey(dateKey)

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

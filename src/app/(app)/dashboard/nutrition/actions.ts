'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { parseInput } from '@/lib/nutrition/parser'
import { trackMeal } from '@/lib/nutrition/engine'
import { getErrorMessage } from '@/utils/errorMessage'

export async function logMealAction(mealText: string, dateKey?: string) {
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

    const meal = parseInput(normalizedText)
    const row = await trackMeal(userId, meal, resolvedDateKey)

    revalidatePath('/dashboard/nutrition')
    return { ok: true, meal, entry: row || null }
  } catch (e: unknown) {
    const message = String(getErrorMessage(e) || '')
    const unknownPrefix = 'nutrition_parser_unknown_food:'
    if (message.startsWith(unknownPrefix)) {
      const raw = message.slice(unknownPrefix.length).trim()
      const parts = raw.split('|').map((s) => String(s || '').trim()).filter(Boolean)
      const list = parts.slice(0, 6).join(', ')
      return { ok: false, error: list ? `Não reconheci: ${list}.` : 'Não reconheci alguns itens.' }
    }
    const looksLikeMissingTable =
      message.toLowerCase().includes('could not find the table') ||
      message.toLowerCase().includes('schema cache') ||
      message.toLowerCase().includes('nutrition_meal_entries') ||
      message.toLowerCase().includes('nutrition_add_meal_entry')
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

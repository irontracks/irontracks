'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { parseInput } from '@/lib/nutrition/parser'
import { trackMeal } from '@/lib/nutrition/engine'

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
  } catch (e) {
    const message = String(e?.message || '')
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

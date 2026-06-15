import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Núcleo compartilhado das mutações de nutrição (delete / edit / água) e do
 * recálculo de totais do dia.
 *
 * Extraído das Server Actions (`src/app/(app)/dashboard/nutrition/actions.ts`)
 * para que tanto as actions (caminho ONLINE, comportamento idêntico) quanto as
 * rotas de API consumidas pela FILA OFFLINE (`/api/nutrition/*`) chamem a mesma
 * lógica, sem duplicar nem divergir. Não inclui `revalidatePath` (concern de
 * Server Action) — quem chama decide se revalida.
 */

export interface DayTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface MealDraft {
  food_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** Resolve a data (YYYY-MM-DD) no fuso de São Paulo quando não vier explícita. */
export function resolveDateKey(dateKey?: string): string {
  const s = typeof dateKey === 'string' ? dateKey.trim() : ''
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** Soma os macros de todas as entries do (user, date). */
export async function recalcDayTotals(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<DayTotals> {
  const { data } = await supabase
    .from('nutrition_meal_entries')
    .select('calories, protein, carbs, fat')
    .eq('user_id', userId)
    .eq('date', date)

  const rows = Array.isArray(data) ? data : []
  return {
    calories: rows.reduce((s, r) => s + (Number((r as Record<string, unknown>)?.calories) || 0), 0),
    protein: rows.reduce((s, r) => s + (Number((r as Record<string, unknown>)?.protein) || 0), 0),
    carbs: rows.reduce((s, r) => s + (Number((r as Record<string, unknown>)?.carbs) || 0), 0),
    fat: rows.reduce((s, r) => s + (Number((r as Record<string, unknown>)?.fat) || 0), 0),
  }
}

/** Exclui uma entry do usuário e devolve os totais recalculados do dia. */
export async function deleteEntryCore(
  supabase: SupabaseClient,
  userId: string,
  entryId: string,
): Promise<{ totals: DayTotals | null }> {
  const id = String(entryId ?? '').trim()
  if (!id) throw new Error('ID inválido.')

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

  let totals: DayTotals | null = null
  if (entry?.date) totals = await recalcDayTotals(supabase, userId, String(entry.date))
  return { totals }
}

/** Edita os macros/nome de uma entry e devolve os totais recalculados do dia. */
export async function editEntryCore(
  supabase: SupabaseClient,
  userId: string,
  entryId: string,
  draft: MealDraft,
): Promise<{ totals: DayTotals | null }> {
  const id = String(entryId ?? '').trim()
  if (!id) throw new Error('ID inválido.')

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

  let totals: DayTotals | null = null
  if (updated?.date) totals = await recalcDayTotals(supabase, userId, String(updated.date))
  return { totals }
}

/** Upsert da água (ml) do dia em daily_nutrition_logs, com clamp 0..10000. */
export async function setWaterCore(
  supabase: SupabaseClient,
  userId: string,
  ml: number,
  dateKey: string,
): Promise<{ water_ml: number }> {
  const safeMl = Math.max(0, Math.min(10000, Math.round(Number(ml) || 0)))
  const { error } = await supabase
    .from('daily_nutrition_logs')
    .upsert(
      { user_id: userId, date: dateKey, water_ml: safeMl, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' },
    )
  if (error) throw error
  return { water_ml: safeMl }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MealItem } from './engine'

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
  /** Macros explícitos (edição legada). Ignorados quando `items` está presente. */
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  /** Quando presente, os totais da entry e os macros viram a SOMA dos itens. */
  items?: MealItem[]
}

/** Sanitiza/arredonda um item (mesma forma do trackMeal). */
function sanitizeItems(items: MealItem[]): MealItem[] {
  return (Array.isArray(items) ? items : []).map((it) => ({
    label: String(it?.label ?? '').slice(0, 120),
    grams: Math.max(0, Math.round(Number(it?.grams) || 0)),
    calories: Math.max(0, Math.round(Number(it?.calories) || 0)),
    protein: Math.max(0, Math.round(Number(it?.protein) || 0)),
    carbs: Math.max(0, Math.round(Number(it?.carbs) || 0)),
    fat: Math.max(0, Math.round(Number(it?.fat) || 0)),
  }))
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

/**
 * Edita uma entry e devolve os totais recalculados do dia.
 * - Com `draft.items`: os macros/calorias da entry viram a SOMA dos itens (fonte
 *   única) e a coluna `items` é regravada.
 * - Sem `items` (edição legada / jobs offline antigos): grava os macros do draft.
 */
export async function editEntryCore(
  supabase: SupabaseClient,
  userId: string,
  entryId: string,
  draft: MealDraft,
): Promise<{ totals: DayTotals | null }> {
  const id = String(entryId ?? '').trim()
  if (!id) throw new Error('ID inválido.')

  const update: Record<string, unknown> = {
    food_name: String(draft.food_name ?? '').trim() || 'Refeição',
  }

  if (Array.isArray(draft.items)) {
    const items = sanitizeItems(draft.items)
    update.items = items.length > 0 ? items : null
    update.calories = items.reduce((s, it) => s + it.calories, 0)
    update.protein = items.reduce((s, it) => s + it.protein, 0)
    update.carbs = items.reduce((s, it) => s + it.carbs, 0)
    update.fat = items.reduce((s, it) => s + it.fat, 0)
  } else {
    update.calories = Math.max(0, Number(draft.calories) || 0)
    update.protein = Math.max(0, Number(draft.protein) || 0)
    update.carbs = Math.max(0, Number(draft.carbs) || 0)
    update.fat = Math.max(0, Number(draft.fat) || 0)
  }

  const { data: updated, error } = await supabase
    .from('nutrition_meal_entries')
    .update(update)
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

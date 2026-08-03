import { createClient } from '@/utils/supabase/client'
import { logError } from '@/lib/logger'
import type { ActionResult } from '@/types/actions'
import { normalizeNutritionPhase, type NutritionPhase } from '@/lib/nutrition/phase'

/**
 * Escrita da fase nutricional em `user_settings.preferences` (jsonb), RLS-enforced.
 *
 * Por que não usar `useUserSettings().save()`: aquele hook faz upsert do objeto de
 * preferências INTEIRO, montado a partir do estado em memória. Chamado antes da query
 * voltar do servidor — ou com o localStorage frio —, `settings` ainda é
 * DEFAULT_USER_SETTINGS, e o upsert sobrescreveria peso, altura, inventário de
 * anilhas e todo o resto com os defaults. Para gravar UMA chave, o caminho seguro é
 * ler a linha atual e mesclar por cima dela.
 *
 * A leitura falhando ABORTA a escrita de propósito: sem saber o que já está lá, o
 * upsert publicaria um objeto com só esta chave e apagaria o resto.
 */
export async function saveNutritionPhase(
  phase: NutritionPhase,
): Promise<ActionResult<{ phase: NutritionPhase }>> {
  try {
    const safePhase = normalizeNutritionPhase(phase)
    if (!safePhase) return { ok: false, error: 'nutrition_invalid_phase' }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id
    if (!uid) return { ok: false, error: 'not_authenticated' }

    const { data: row, error: readError } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', uid)
      .maybeSingle()

    // Erro de leitura ≠ linha ausente. `maybeSingle` devolve data null sem erro
    // quando o usuário ainda não tem settings — esse caso é legítimo e vira um
    // objeto novo. Já um erro de verdade (rede, RLS, tabela) impede o merge.
    if (readError) throw readError

    const current = row?.preferences && typeof row.preferences === 'object'
      ? (row.preferences as Record<string, unknown>)
      : {}

    const { error: writeError } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: uid,
          preferences: { ...current, nutritionPhase: safePhase },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

    if (writeError) throw writeError
    return { ok: true, data: { phase: safePhase } }
  } catch (e) {
    logError('saveNutritionPhase', e)
    return { ok: false, error: 'nutrition_save_phase_failed' }
  }
}

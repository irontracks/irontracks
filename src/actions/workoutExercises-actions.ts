import { createClient } from '@/utils/supabase/client'
import { logError } from '@/lib/logger'
import type { ActionResult } from '@/types/actions'

/**
 * Reordenação de exercícios dentro de um treino (tela de visualização rápida).
 *
 * A ordem vive em `exercises.order` e é o que `mapWorkoutRow` usa pra montar a
 * lista — então reescrever a coluna é suficiente pra tela toda refletir.
 *
 * ⚠️ Só treino NÃO iniciado. Reordenar exercício de sessão em andamento
 * embaralharia os logs, que são indexados por posição ("exIdx-setIdx"): o peso
 * registrado no exercício 3 passaria a pertencer a outro. O app tem um caminho
 * próprio pra edição mid-sessão (reconcileEditedExercises); esta action não é
 * ele e recusa o caso em vez de corromper o histórico.
 */
export async function reorderWorkoutExercises(
    workoutId: string,
    orderedExerciseIds: string[],
): Promise<ActionResult<{ updated: number }>> {
    try {
        const id = String(workoutId || '').trim()
        const ids = (orderedExerciseIds || []).map((v) => String(v || '').trim()).filter(Boolean)
        if (!id || ids.length === 0) return { ok: false, error: 'missing_params' }
        if (new Set(ids).size !== ids.length) return { ok: false, error: 'duplicated_ids' }

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized' }

        const { data: workout, error: wErr } = await supabase
            .from('workouts')
            .select('id, user_id, completed_at')
            .eq('id', id)
            .maybeSingle()
        if (wErr) return { ok: false, error: wErr.message }
        if (!workout || (workout as { user_id?: string }).user_id !== user.id) return { ok: false, error: 'not_found' }
        if ((workout as { completed_at?: string | null }).completed_at) return { ok: false, error: 'workout_completed' }

        // Confere que os ids pertencem MESMO a este treino antes de escrever:
        // um id de outro treino aqui moveria exercício entre treinos.
        const { data: rows, error: exErr } = await supabase
            .from('exercises')
            .select('id')
            .eq('workout_id', id)
        if (exErr) return { ok: false, error: exErr.message }
        const owned = new Set((rows || []).map((r) => String((r as { id: string }).id)))
        if (ids.some((exId) => !owned.has(exId))) return { ok: false, error: 'exercise_not_in_workout' }
        if (ids.length !== owned.size) return { ok: false, error: 'incomplete_order' }

        // Sem RPC de reordenação no app: atualiza uma linha por vez. Falha no meio
        // deixa ordem parcial — visível e corrigível na tela, não silenciosa.
        let updated = 0
        for (let i = 0; i < ids.length; i++) {
            const { error } = await supabase.from('exercises').update({ order: i }).eq('id', ids[i]).eq('workout_id', id)
            if (error) return { ok: false, error: `ordem aplicada até o ${updated}º exercício: ${error.message}` }
            updated += 1
        }

        return { ok: true, data: { updated } }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        logError('reorderWorkoutExercises', e)
        return { ok: false, error: message }
    }
}

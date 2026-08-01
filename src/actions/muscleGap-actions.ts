import { createClient } from '@/utils/supabase/client'
import type { ActionResult } from '@/types/actions'

/**
 * Leitura auxiliar do card "Ajustar treino".
 *
 * A ESCRITA (adicionar exercício) mora em `workoutExercises-actions`, junto com
 * reordenar e excluir: as três passam por /api/workouts/exercises porque
 * precisam derrubar o cache de lista do servidor. Ter duas portas pra mesma
 * escrita foi o que produziu a divergência que este arquivo já causou.
 */

export interface ActiveWorkoutOption {
    id: string
    name: string
    exerciseCount: number
}

/**
 * Treinos ATIVOS do usuário (os cards com "Iniciar treino"): não concluídos e
 * não arquivados. Sessão finalizada é histórico e não recebe exercício novo.
 */
export async function listActiveWorkouts(): Promise<ActionResult<ActiveWorkoutOption[]>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized' }

        const { data, error } = await supabase
            .from('workouts')
            .select('id, name, sort_order, exercises(count)')
            .eq('user_id', user.id)
            .is('completed_at', null)
            .is('archived_at', null)
            .order('sort_order', { ascending: true, nullsFirst: false })
            .limit(50)
        if (error) return { ok: false, error: error.message }

        const rows = (data || []) as Array<{ id: string; name: string | null; exercises?: Array<{ count: number }> }>
        return {
            ok: true,
            data: rows.map((w) => ({
                id: String(w.id),
                name: String(w.name || 'Treino sem nome'),
                exerciseCount: Number(w.exercises?.[0]?.count ?? 0),
            })),
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

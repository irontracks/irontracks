import { createClient } from '@/utils/supabase/client'
import { trackUserEvent } from '@/lib/telemetry/userActivity'
import { logError } from '@/lib/logger'
import type { ActionResult } from '@/types/actions'

/**
 * Escritas do card "Ajustar treino" — client autenticado, RLS no comando.
 *
 * É o único ponto desta feature que MEXE no treino do usuário: tudo mais
 * (diagnóstico, sugestões) é leitura. Por isso duas travas explícitas aqui:
 *
 *  - `DEFAULT_SETS` fixo e pequeno: entrar com 3 séries num treino que já
 *    existe é reversível e não desmonta a sessão. O card mostra o número antes
 *    de você confirmar.
 *  - o exercício entra no FIM do treino (`order` = max + 1), nunca no meio:
 *    reordenar a sessão de alguém sem pedir é modificar o que ele já planejou.
 */

const DEFAULT_SETS = 3
const DEFAULT_REST_SECONDS = 90

export interface ActiveWorkoutOption {
    id: string
    name: string
    exerciseCount: number
}

/**
 * Treinos ATIVOS do usuário (os cards com "Iniciar treino"): não concluídos e
 * não arquivados. Sessões já finalizadas viram histórico e não podem receber
 * exercício novo — adicionar ali reescreveria um treino que já aconteceu.
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

export interface AddExerciseInput {
    workoutId: string
    exerciseName: string
    /** Rótulo do grupo, só para preencher `exercises.muscle_group`. */
    muscleGroup?: string | null
    sets?: number
    videoUrl?: string | null
}

/**
 * Insere um exercício no fim de um treino ativo, com séries em branco prontas
 * para preencher na execução.
 *
 * Não é transacional (o app não tem RPC para isto): se as séries falharem
 * depois do exercício entrar, o exercício fica sem série — visível e editável
 * na tela, em vez de um erro silencioso. Reportamos o erro nesse caso.
 */
export async function addExerciseToWorkout(input: AddExerciseInput): Promise<ActionResult<{ exerciseId: string }>> {
    try {
        const workoutId = String(input?.workoutId || '').trim()
        const name = String(input?.exerciseName || '').trim()
        if (!workoutId || !name) return { ok: false, error: 'missing_params' }
        const setCount = Math.min(6, Math.max(1, Number(input.sets) || DEFAULT_SETS))

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized' }

        // Confirma que o treino é do usuário E ainda está ativo. A RLS já barra
        // treino de terceiro; esta checagem é sobre o ESTADO — não deixar cair
        // exercício numa sessão concluída.
        const { data: workout, error: wErr } = await supabase
            .from('workouts')
            .select('id, user_id, completed_at')
            .eq('id', workoutId)
            .maybeSingle()
        if (wErr) return { ok: false, error: wErr.message }
        if (!workout || (workout as { user_id?: string }).user_id !== user.id) return { ok: false, error: 'not_found' }
        if ((workout as { completed_at?: string | null }).completed_at) return { ok: false, error: 'workout_completed' }

        const { data: lastRows } = await supabase
            .from('exercises')
            .select('order')
            .eq('workout_id', workoutId)
            .order('order', { ascending: false })
            .limit(1)
        const lastOrder = Number((lastRows as Array<{ order: number | null }> | null)?.[0]?.order ?? -1)

        const { data: created, error: exErr } = await supabase
            .from('exercises')
            .insert({
                workout_id: workoutId,
                name,
                muscle_group: input.muscleGroup ? String(input.muscleGroup) : null,
                video_url: input.videoUrl || null,
                rest_time: DEFAULT_REST_SECONDS,
                order: Number.isFinite(lastOrder) ? lastOrder + 1 : 0,
            })
            .select('id')
            .single()
        if (exErr) return { ok: false, error: exErr.message }

        const exerciseId = String((created as { id?: string } | null)?.id || '')
        if (!exerciseId) return { ok: false, error: 'create_failed' }

        const { error: setsErr } = await supabase.from('sets').insert(
            Array.from({ length: setCount }, (_, i) => ({
                exercise_id: exerciseId,
                set_number: i + 1,
                reps: '',
                set_type: 'working',
                is_warmup: false,
                completed: false,
            })),
        )
        if (setsErr) return { ok: false, error: `exercício criado, mas as séries falharam: ${setsErr.message}` }

        try {
            trackUserEvent('muscle_gap_exercise_added', {
                type: 'workout',
                metadata: { workoutId, name, sets: setCount, muscleGroup: input.muscleGroup ?? null },
            })
        } catch (e) {
            logError('addExerciseToWorkout.track', e)
        }

        return { ok: true, data: { exerciseId } }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

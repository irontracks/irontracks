import type { ActionResult } from '@/types/actions'

/**
 * Adicionar / reordenar / excluir exercício de um treino.
 *
 * ⚠️ Estas funções NÃO escrevem no Supabase direto, e isso é deliberado: a lista
 * de treinos é cacheada no SERVIDOR (`dashboard:bootstrap` por 300s,
 * `workouts:list` por 60s). Escrevendo pelo browser, o banco mudava e o cache
 * ficava intacto — o refetch trazia o dado antigo por até 5 minutos, que foi o
 * sintoma relatado ("reordenei e ao iniciar o treino veio na ordem velha").
 *
 * Tudo passa por /api/workouts/exercises, que grava e derruba os dois caches.
 */

interface ExercisesApiBody {
    action: 'add' | 'reorder' | 'delete'
    workoutId: string
    exerciseName?: string
    muscleGroup?: string | null
    videoUrl?: string | null
    sets?: number
    orderedExerciseIds?: string[]
    exerciseId?: string
}

async function callExercisesApi<T = unknown>(body: ExercisesApiBody): Promise<ActionResult<T>> {
    try {
        const res = await fetch('/api/workouts/exercises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => null) as Record<string, unknown> | null
        if (!res.ok || !json?.ok) {
            return { ok: false, error: String(json?.error || 'Falha ao salvar o treino.') }
        }
        return { ok: true, data: json as T }
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erro de rede.' }
    }
}

export interface AddExerciseInput {
    workoutId: string
    exerciseName: string
    muscleGroup?: string | null
    sets?: number
    videoUrl?: string | null
}

/** Insere no FIM do treino, com séries em branco prontas pra preencher na execução. */
export async function addExerciseToWorkout(input: AddExerciseInput): Promise<ActionResult<{ exerciseId: string }>> {
    const workoutId = String(input?.workoutId || '').trim()
    const exerciseName = String(input?.exerciseName || '').trim()
    if (!workoutId || !exerciseName) return { ok: false, error: 'missing_params' }

    return callExercisesApi<{ exerciseId: string }>({
        action: 'add',
        workoutId,
        exerciseName,
        muscleGroup: input.muscleGroup ?? null,
        videoUrl: input.videoUrl ?? null,
        sets: Math.min(6, Math.max(1, Number(input.sets) || 3)),
    })
}

/** A ordem enviada precisa conter TODOS os exercícios do treino — a rota recusa parcial. */
export async function reorderWorkoutExercises(
    workoutId: string,
    orderedExerciseIds: string[],
): Promise<ActionResult<{ updated: number }>> {
    const id = String(workoutId || '').trim()
    const ids = (orderedExerciseIds || []).map((v) => String(v || '').trim()).filter(Boolean)
    if (!id || !ids.length) return { ok: false, error: 'missing_params' }

    const res = await callExercisesApi({ action: 'reorder', workoutId: id, orderedExerciseIds: ids })
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, data: { updated: ids.length } }
}

export async function deleteWorkoutExercise(
    workoutId: string,
    exerciseId: string,
): Promise<ActionResult<{ deleted: true }>> {
    const id = String(workoutId || '').trim()
    const exId = String(exerciseId || '').trim()
    if (!id || !exId) return { ok: false, error: 'missing_params' }

    const res = await callExercisesApi({ action: 'delete', workoutId: id, exerciseId: exId })
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, data: { deleted: true } }
}

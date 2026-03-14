import { createClient } from '@/utils/supabase/client'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'
import { trackUserEvent } from '@/lib/telemetry/userActivity'
import type { ActionResult } from '@/types/actions'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { cacheDeletePattern } from '@/utils/cache'

// ─── Private helpers ─────────────────────────────────────────────────────────

export const invalidateWorkoutCaches = async (userId: string) => {
    if (!userId) return
    try {
        await Promise.all([
            cacheDeletePattern(`workouts:list:${userId}*`),
            cacheDeletePattern(`workouts:history:${userId}:*`),
            cacheDeletePattern(`dashboard:bootstrap:${userId}`),
        ])
    } catch { }
}

export const safeString = (v: unknown): string => String(v ?? '').trim()

export const safeIso = (v: unknown): string | null => {
    try {
        if (!v) return null
        const d = v instanceof Date ? v : new Date(v as string | number)
        const t = d.getTime()
        return Number.isFinite(t) ? d.toISOString() : null
    } catch {
        return null
    }
}

const safeJsonParse = (raw: unknown): unknown => parseJsonWithSchema(raw, z.unknown())

export const buildExercisesPayload = (workout: unknown): unknown[] => {
    const w = workout && typeof workout === 'object' ? (workout as Record<string, unknown>) : ({} as Record<string, unknown>)
    const exercises = Array.isArray(w.exercises) ? (w.exercises as unknown[]) : []
    return exercises
        .filter((ex) => ex && typeof ex === 'object')
        .map((ex, idx) => {
            const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : ({} as Record<string, unknown>)
            const setDetails =
                Array.isArray(exObj.setDetails)
                    ? (exObj.setDetails as unknown[])
                    : Array.isArray(exObj.set_details)
                        ? (exObj.set_details as unknown[])
                        : Array.isArray(exObj.sets)
                            ? (exObj.sets as unknown[])
                            : null
            const headerSets = Number.parseInt(String(exObj.sets ?? ''), 10) || 0
            const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0)
            const sets: Array<Record<string, unknown>> = []
            for (let i = 0; i < numSets; i += 1) {
                const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null
                const sObj = s && typeof s === 'object' ? (s as Record<string, unknown>) : ({} as Record<string, unknown>)
                sets.push({
                    weight: sObj.weight ?? null,
                    reps: (sObj.reps ?? exObj.reps) ?? null,
                    rpe: (sObj.rpe ?? exObj.rpe) ?? null,
                    set_number: (sObj.set_number ?? sObj.setNumber) ?? (i + 1),
                    completed: false,
                    is_warmup: !!(sObj.is_warmup ?? sObj.isWarmup),
                    advanced_config: (sObj.advanced_config ?? sObj.advancedConfig) ?? null,
                })
            }
            return {
                name: safeString(exObj.name || ''),
                notes: safeString(exObj.notes || ''),
                video_url: (exObj.videoUrl ?? exObj.video_url) ?? null,
                rest_time: (exObj.restTime ?? exObj.rest_time) ?? null,
                cadence: exObj.cadence ?? null,
                method: exObj.method ?? null,
                order: idx,
                sets,
            }
        })
}

// ─── Exported CRUD actions ────────────────────────────────────────────────────

export async function createWorkout(workout: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized' }

        const title = safeString(workout?.title ?? workout?.name ?? 'Treino')
        const exercisesPayload = buildExercisesPayload(workout)
        const notes = workout?.notes != null ? safeString(workout.notes) : ''
        try { trackUserEvent('workout_create', { type: 'workout', metadata: { title, exercisesCount: exercisesPayload.length } }) } catch { }

        const { data: workoutId, error } = await supabase.rpc('save_workout_atomic', {
            p_workout_id: null,
            p_user_id: user.id,
            p_created_by: user.id,
            p_is_template: true,
            p_name: normalizeWorkoutTitle(title),
            p_notes: notes,
            p_exercises: exercisesPayload,
        })
        if (error) return { ok: false, error: error.message }
        if (!workoutId) return { ok: false, error: 'Falha ao criar treino' }
        try { trackUserEvent('workout_create_ok', { type: 'workout', metadata: { id: workoutId, title } }) } catch { }
        await invalidateWorkoutCaches(user.id)
        return { ok: true, data: { id: String(workoutId) } }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        try { trackUserEvent('workout_create_error', { type: 'workout', metadata: { message } }) } catch { }
        return { ok: false, error: message }
    }
}

export async function updateWorkout(id: string, workout: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return { ok: false, error: 'unauthorized' }

        const workoutId = safeString(id)
        if (!workoutId) return { ok: false, error: 'missing id' }

        const title = safeString(workout?.title ?? workout?.name ?? 'Treino')
        const exercisesPayload = buildExercisesPayload(workout)
        const notes = workout?.notes != null ? safeString(workout.notes) : ''
        try { trackUserEvent('workout_update', { type: 'workout', metadata: { id: workoutId, title, exercisesCount: exercisesPayload.length } }) } catch { }

        const { data: savedId, error } = await supabase.rpc('save_workout_atomic', {
            p_workout_id: workoutId,
            p_user_id: user.id,
            p_created_by: user.id,
            p_is_template: true,
            p_name: normalizeWorkoutTitle(title),
            p_notes: notes,
            p_exercises: exercisesPayload,
        })
        if (error) return { ok: false, error: error.message }
        try { trackUserEvent('workout_update_ok', { type: 'workout', metadata: { id: savedId || workoutId, title } }) } catch { }
        await invalidateWorkoutCaches(user.id)
        return { ok: true, data: { id: String(savedId || workoutId) } }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        try { trackUserEvent('workout_update_error', { type: 'workout', metadata: { message } }) } catch { }
        return { ok: false, error: message }
    }
}

export async function deleteWorkout(id: string): Promise<ActionResult> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const workoutId = safeString(id)
        if (!workoutId) return { ok: false, error: 'missing id' }
        if (!user?.id) return { ok: false, error: 'unauthorized' }
        try { trackUserEvent('workout_delete', { type: 'workout', metadata: { id: workoutId } }) } catch { }
        const { error } = await supabase.from('workouts').delete().eq('id', workoutId).eq('user_id', user.id)
        if (error) return { ok: false, error: error.message }
        try { trackUserEvent('workout_delete_ok', { type: 'workout', metadata: { id: workoutId } }) } catch { }
        if (user?.id) await invalidateWorkoutCaches(user.id)
        return { ok: true, data: undefined }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        try { trackUserEvent('workout_delete_error', { type: 'workout', metadata: { message } }) } catch { }
        return { ok: false, error: message }
    }
}

export async function setWorkoutArchived(id: string, archived = true): Promise<ActionResult> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { ok: false, error: 'unauthorized' }
        const workoutId = safeString(id)
        if (!workoutId) return { ok: false, error: 'missing id' }
        const archivedAt = archived ? new Date().toISOString() : null
        // R3#4: Add user_id filter to prevent IDOR — users can only archive their own workouts
        const { error } = await supabase.from('workouts').update({ archived_at: archivedAt }).eq('id', workoutId).eq('user_id', user.id)
        if (error) return { ok: false, error: error.message }
        void archivedAt
        if (user?.id) await invalidateWorkoutCaches(user.id)
        return { ok: true, data: undefined }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function setWorkoutSortOrder(ids: string[]): Promise<ActionResult> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const list = (Array.isArray(ids) ? ids : []).map((x) => safeString(x)).filter(Boolean)
        if (!user?.id) return { ok: false, error: 'unauthorized' }
        for (let i = 0; i < list.length; i += 1) {
            const workoutId = list[i]
            const { error } = await supabase.from('workouts').update({ sort_order: i }).eq('id', workoutId).eq('user_id', user.id)
            if (error) return { ok: false, error: error.message }
        }
        if (user?.id) await invalidateWorkoutCaches(user.id)
        return { ok: true, data: undefined }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return { ok: false, error: message }
    }
}

export async function importData(payload: unknown): Promise<ActionResult<{ imported: number }>> {
    const payloadObj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
    const workouts = Array.isArray(payloadObj?.workouts) ? (payloadObj?.workouts as unknown[]) : []
    if (!workouts.length) return { ok: true, data: { imported: 0 } }

    let created = 0
    for (const w of workouts) {
        const wObj = w && typeof w === 'object' ? (w as Record<string, unknown>) : ({} as Record<string, unknown>)
        const res = await createWorkout({
            title: wObj?.title ?? wObj?.name ?? 'Treino',
            notes: wObj?.notes ?? '',
            exercises: Array.isArray(wObj?.exercises) ? (wObj.exercises as unknown[]) : [],
        })
        if (res?.ok) created += 1
    }
    return { ok: true, data: { imported: created } }
}

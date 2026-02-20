import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'

const safeString = (v: any) => String(v ?? '').trim()

const ZodBodySchema = z
  .object({
    workout: z.unknown().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    workoutId: z.union([z.string(), z.number()]).optional(),
  })
  .strip()

const buildExercisesPayload = (workout: any) => {
  const w = workout && typeof workout === 'object' ? workout : {}
  const exercises = Array.isArray(w.exercises) ? w.exercises : []
  return exercises
    .filter((ex: any) => ex && typeof ex === 'object')
    .map((ex: any, idx: number) => {
      const setDetails =
        Array.isArray(ex.setDetails) ? ex.setDetails : Array.isArray(ex.set_details) ? ex.set_details : Array.isArray(ex.sets) ? ex.sets : null
      const headerSets = Number.parseInt(String(ex.sets ?? ''), 10) || 0
      const numSets = headerSets || (Array.isArray(setDetails) ? setDetails.length : 0)
      const sets: unknown[] = [];
      for (let i = 0; i < numSets; i += 1) {
        const s = Array.isArray(setDetails) ? (setDetails[i] || null) : null
        sets.push({
          weight: s?.weight ?? null,
          reps: s?.reps ?? ex?.reps ?? null,
          rpe: s?.rpe ?? ex?.rpe ?? null,
          set_number: s?.set_number ?? s?.setNumber ?? i + 1,
          completed: false,
          is_warmup: !!(s?.is_warmup ?? s?.isWarmup),
          advanced_config: s?.advanced_config ?? s?.advancedConfig ?? null,
        })
      }
      return {
        name: safeString(ex?.name || ''),
        notes: safeString(ex?.notes || ''),
        video_url: ex?.videoUrl ?? ex?.video_url ?? null,
        rest_time: ex?.restTime ?? ex?.rest_time ?? null,
        cadence: ex?.cadence ?? null,
        method: ex?.method ?? null,
        order: idx,
        sets,
      }
    })
}

export async function PATCH(request: Request) {
  try {
    const parsedBody = await parseJsonBody(request, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const payload: any = parsedBody.data!
    const workout = payload?.workout && typeof payload.workout === 'object' ? payload.workout : payload
    const workoutId = safeString(payload?.id ?? payload?.workoutId ?? workout?.id ?? workout?.workout_id)
    if (!workoutId) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const title = safeString(workout?.title ?? workout?.name ?? 'Treino')
    const exercisesPayload = buildExercisesPayload(workout)
    const notes = workout?.notes != null ? safeString(workout.notes) : ''

    const { data: savedId, error } = await supabase.rpc('save_workout_atomic', {
      p_workout_id: workoutId,
      p_user_id: user.id,
      p_created_by: user.id,
      p_is_template: true,
      p_name: normalizeWorkoutTitle(title),
      p_notes: notes,
      p_exercises: exercisesPayload,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, id: savedId || workoutId })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

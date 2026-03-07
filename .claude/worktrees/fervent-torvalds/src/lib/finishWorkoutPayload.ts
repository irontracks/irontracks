interface FinishWorkoutInput {
  workout: Record<string, unknown>
  elapsedSeconds: number
  logs: Record<string, unknown>
  ui: Record<string, unknown>
  postCheckin?: Record<string, unknown> | null
}

type AnyRecord = Record<string, unknown>

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

export const buildFinishWorkoutPayload = ({
  workout,
  elapsedSeconds,
  logs,
  ui,
  postCheckin,
}: FinishWorkoutInput) => {
  const w = isObject(workout) ? (workout as AnyRecord) : {}
  const exercisesRaw = Array.isArray(w.exercises) ? w.exercises : []
  const safeExercises = exercisesRaw
    .map((ex) => {
      if (!isObject(ex)) return null
      const e = ex as AnyRecord
      return {
        name: String(e?.name || '').trim(),
        sets: Number(e?.sets) || (Array.isArray(e?.setDetails) ? e.setDetails.length : 0),
        reps: e?.reps ?? '',
        rpe: e?.rpe ?? null,
        cadence: e?.cadence ?? null,
        restTime: e?.restTime ?? e?.rest_time ?? null,
        method: e?.method ?? null,
        videoUrl: e?.videoUrl ?? e?.video_url ?? null,
        notes: e?.notes ?? null,
        setDetails: Array.isArray(e?.setDetails) ? e.setDetails : Array.isArray(e?.set_details) ? e.set_details : [],
      }
    })
    .filter((x) => x !== null && typeof x === 'object' && 'name' in x && String((x as { name?: unknown }).name ?? '').trim().length > 0)

  return {
    workoutTitle: String(w?.title || 'Treino'),
    date: new Date().toISOString(),
    totalTime: elapsedSeconds,
    realTotalTime: elapsedSeconds,
    logs: isObject(logs) ? logs : {},
    exercises: safeExercises,
    originWorkoutId: w?.id ?? null,
    preCheckin: isObject(ui) ? (ui as Record<string, unknown>)?.preCheckin ?? null : null,
    postCheckin: postCheckin ?? null,
  }
}

type AnyRecord = Record<string, any>

const isObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v)

export const buildFinishWorkoutPayload = ({
  workout,
  elapsedSeconds,
  logs,
  ui,
  postCheckin,
}: {
  workout: any
  elapsedSeconds: any
  logs: any
  ui: any
  postCheckin: any
}) => {
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
    .filter((x) => x && typeof x === 'object' && String((x as any).name || '').length > 0)

  return {
    workoutTitle: String(w?.title || 'Treino'),
    date: new Date().toISOString(),
    totalTime: elapsedSeconds,
    realTotalTime: elapsedSeconds,
    logs: logs && typeof logs === 'object' ? logs : {},
    exercises: safeExercises,
    originWorkoutId: w?.id ?? null,
    preCheckin: ui?.preCheckin ?? null,
    postCheckin,
  }
}

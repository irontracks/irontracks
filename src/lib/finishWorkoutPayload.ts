import { type FinishWorkoutInput } from '@/schemas/workout'

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
        sets: Number(e?.sets) || (Array.isArray(e?.setDetails) ? (e.setDetails as unknown[]).length : 0),
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

  const logsObj = isObject(logs) ? (logs as Record<string, unknown>) : {}
  let executionTotalSeconds = 0
  let restTotalSeconds = 0
  Object.values(logsObj).forEach((v) => {
    if (!isObject(v)) return
    const obj = v as AnyRecord
    const execRaw = obj.executionSeconds ?? obj.execution_seconds
    const restRaw = obj.restSeconds ?? obj.rest_seconds
    const exec = typeof execRaw === 'number' ? execRaw : Number(String(execRaw ?? '').trim())
    const rest = typeof restRaw === 'number' ? restRaw : Number(String(restRaw ?? '').trim())
    if (Number.isFinite(exec) && exec > 0) executionTotalSeconds += Math.round(exec)
    if (Number.isFinite(rest) && rest > 0) restTotalSeconds += Math.round(rest)
  })

  return {
    workoutTitle: String(w?.title || 'Treino'),
    date: new Date().toISOString(),
    totalTime: elapsedSeconds,
    realTotalTime: elapsedSeconds,
    executionTotalSeconds,
    restTotalSeconds,
    logs: logsObj,
    exercises: safeExercises,
    originWorkoutId: w?.id ?? null,
    preCheckin: isObject(ui) ? (ui as Record<string, unknown>)?.preCheckin ?? null : null,
    postCheckin: postCheckin ?? null,
  }
}

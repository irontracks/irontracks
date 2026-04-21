import { isPlank } from './exerciseTracking'

type SetLike = {
  weight?: number | null
  reps?: string | number | null
  duration_seconds?: number | null
  durationSeconds?: number | null
}

type ExerciseLike = {
  name?: string | null
}

export function formatSetSummary(set: SetLike, exercise: ExerciseLike): string {
  const name = exercise?.name ?? ''
  const weight = typeof set.weight === 'number' && set.weight > 0 ? set.weight : null
  const weightStr = weight !== null ? ` × ${weight} kg` : ''

  if (isPlank(name)) {
    const duration =
      (typeof set.duration_seconds === 'number' && set.duration_seconds > 0 ? set.duration_seconds : null) ??
      (typeof set.durationSeconds === 'number' && set.durationSeconds > 0 ? set.durationSeconds : null) ??
      (typeof set.reps === 'string' && /^\d+$/.test(set.reps.trim()) ? Number(set.reps) : null) ??
      (typeof set.reps === 'number' && set.reps > 0 ? set.reps : null)
    if (duration === null) return ''
    return `${duration}s${weightStr}`
  }

  const repsNum =
    (typeof set.reps === 'number' && set.reps > 0 ? set.reps : null) ??
    (typeof set.reps === 'string' && set.reps.trim() !== '' ? set.reps.trim() : null)
  if (repsNum === null) return ''
  return `${repsNum}${weightStr}`
}

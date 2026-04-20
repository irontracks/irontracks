const PLANK_REGEX = /\b(prancha|plank)\b/i

export function isPlank(exerciseName: string | null | undefined): boolean {
  if (!exerciseName || typeof exerciseName !== 'string') return false
  return PLANK_REGEX.test(exerciseName.trim())
}

const PLANK_REGEX = /\b(prancha|plank)\b/i
const UNILATERAL_REGEX = /\bunilateral\b/i

export function isPlank(exerciseName: string | null | undefined): boolean {
  if (!exerciseName || typeof exerciseName !== 'string') return false
  return PLANK_REGEX.test(exerciseName.trim())
}

/**
 * Detect whether an exercise name hints at unilateral execution (L/R sides).
 * Used as a fallback when the `is_unilateral` flag isn't set on the exercise
 * record — so templates created before the flag existed (or imported without
 * it) still render the unilateral modal automatically.
 */
export function isUnilateralByName(exerciseName: string | null | undefined): boolean {
  if (!exerciseName || typeof exerciseName !== 'string') return false
  return UNILATERAL_REGEX.test(exerciseName.trim())
}

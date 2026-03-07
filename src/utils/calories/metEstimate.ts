/**
 * MET-based calorie estimation for resistance training sessions.
 *
 * MET (Metabolic Equivalent of Task) scale used:
 * - Light    (avg load <  20 kg/rep): MET 3.5
 * - Moderate (avg load < 50 kg/rep): MET 5.0
 * - Vigorous (avg load ≥ 50 kg/rep): MET 6.0
 *
 * Assumes 75 kg body weight when not available (common athlete estimate).
 * Formula: kcal = MET × bodyWeightKg × durationHours
 */

type AnyObj = Record<string, unknown>

export const MET_LIGHT = 3.5
export const MET_MODERATE = 5.0
export const MET_VIGOROUS = 6.0

/** Default body weight in kg used when athlete weight is unavailable. */
export const DEFAULT_BODY_WEIGHT_KG = 75

/**
 * Estimates calories burned during a resistance training session using MET.
 *
 * @param sessionLogs   - The session's log entries keyed by `"exerciseIdx-setIdx"`.
 * @param durationMinutes - Total duration of the session in minutes.
 * @returns Estimated kcal burned, rounded to the nearest integer. Returns 0 if
 *          duration is zero or inputs are invalid.
 */
export const estimateCaloriesMet = (
  sessionLogs: Record<string, unknown>,
  durationMinutes: number
): number => {
  if (!durationMinutes || durationMinutes <= 0) return 0

  const logEntries = Object.values(sessionLogs)
  let totalWeightedReps = 0
  let totalReps = 0

  for (const v of logEntries) {
    if (!v || typeof v !== 'object') continue
    const obj = v as AnyObj
    const w = Number(String(obj?.weight ?? '').replace(',', '.'))
    const r = Number(String(obj?.reps ?? '').replace(',', '.'))
    if (w > 0 && r > 0) {
      totalWeightedReps += w * r
      totalReps += r
    }
  }

  const avgWeightPerRep = totalReps > 0 ? totalWeightedReps / totalReps : 0
  const met = avgWeightPerRep < 20 ? MET_LIGHT : avgWeightPerRep < 50 ? MET_MODERATE : MET_VIGOROUS

  const kcal = met * DEFAULT_BODY_WEIGHT_KG * (durationMinutes / 60)
  return Number.isFinite(kcal) && kcal > 0 ? Math.round(kcal) : 0
}

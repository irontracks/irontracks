
import type { UnknownRecord } from '@/types/app'
import { estimateCaloriesMet } from '@/utils/calories/metEstimate'

// ── B: improved fallback — same MET model as the local estimate ───────────────
export const computeFallbackKcal = ({
  session,
  weightKg,
  biologicalSex,
}: {
  session: unknown
  weightKg?: number | null
  biologicalSex?: string | null
}) => {
  try {
    const s = session && typeof session === 'object' ? (session as UnknownRecord) : {}
    const outdoorBike = s.outdoorBike && typeof s.outdoorBike === 'object' ? (s.outdoorBike as UnknownRecord) : null
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)

    const logs = s.logs && typeof s.logs === 'object' ? (s.logs as Record<string, unknown>) : {}
    const execSeconds = Number(s.executionTotalSeconds ?? (s as UnknownRecord).execution_total_seconds ?? 0) || 0
    const restSeconds = Number(s.restTotalSeconds ?? (s as UnknownRecord).rest_total_seconds ?? 0) || 0
    const durationMinutes =
      execSeconds + restSeconds > 0 ? (execSeconds + restSeconds) / 60 : (Number(s.totalTime) || 0) / 60

    // Extract exercise names for complexity factor
    const exerciseNames = Array.isArray(s.exercises)
      ? (s.exercises as unknown[]).map((ex) => {
        const e = ex && typeof ex === 'object' ? (ex as UnknownRecord) : null
        return String(e?.name || '').trim()
      }).filter(Boolean) as string[]
      : null

    // Use the proper MET estimator (handles weight, complexity, active time, sex)
    const kcal = estimateCaloriesMet(logs, durationMinutes, weightKg, exerciseNames, null, null, null, biologicalSex ?? null)
    if (kcal > 0) return kcal

    // Dead-last resort (no logs at all) — use MET_LIGHT × default weight × duration
    const DEFAULT_BW = 78
    const MET_LIGHT_FALLBACK = 3.5
    if (durationMinutes > 0) return Math.round(MET_LIGHT_FALLBACK * DEFAULT_BW * (durationMinutes / 60))
    return 0
  } catch {
    return 0
  }
}

// ── A + C: extract preCheckin weight and RPE from session ────────────────────
const extractPreCheckinWeight = (session: UnknownRecord): number | null => {
  const pc = session?.preCheckin && typeof session.preCheckin === 'object'
    ? (session.preCheckin as UnknownRecord) : null
  if (!pc) return null
  const candidates = [
    pc?.weight,
    pc?.body_weight_kg,
    (pc?.answers as UnknownRecord)?.body_weight_kg,
  ]
  for (const c of candidates) {
    const n = Number(c)
    if (Number.isFinite(n) && n >= 20 && n <= 300) return n
  }
  return null
}

export const getKcalEstimate = async ({
  session,
  workoutId,
  rpe,
  biologicalSex,
}: {
  session: unknown
  workoutId?: unknown
  rpe?: number | null
  biologicalSex?: string | null
}) => {
  try {
    const s = session && typeof session === 'object' ? (session as UnknownRecord) : {}
    const preCheckinWeightKg = extractPreCheckinWeight(s)
    const fallback = computeFallbackKcal({ session: s, weightKg: preCheckinWeightKg, biologicalSex })

    const resp = await fetch('/api/calories/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: s,
        workoutId: typeof workoutId === 'string' ? workoutId : null,
        // A: pass preCheckin weight so API uses it instead of fetching old assessment
        preCheckinWeightKg: preCheckinWeightKg ?? null,
        // C: pass RPE so Gemini gets context and multiplier is applied server-side
        rpe: rpe != null && Number.isFinite(Number(rpe)) ? Number(rpe) : null,
      }),
    })
    const json = await resp.json().catch((): null => null)
    const kcal = Number((json as Record<string, unknown>)?.kcal)
    if (!resp.ok) return fallback
    if (!Number.isFinite(kcal) || kcal <= 0) return fallback
    return Math.round(kcal)
  } catch {
    const s = session && typeof session === 'object' ? (session as UnknownRecord) : {}
    const preCheckinWeightKg = extractPreCheckinWeight(s)
    return computeFallbackKcal({ session: s, weightKg: preCheckinWeightKg, biologicalSex })
  }
}

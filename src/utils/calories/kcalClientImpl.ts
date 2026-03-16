
import type { UnknownRecord } from '@/types/app'
import { estimateCaloriesMet } from '@/utils/calories/metEstimate'

type WorkoutLogEntry = {
  weight?: unknown
  reps?: unknown
}

type LogsMap = Record<string, WorkoutLogEntry>

const safeString = (v: unknown) => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

const parseRepsValue = (raw: unknown): number => {
  const s = safeString(raw).replace(',', '.')
  if (!s) return 0
  if (s.includes('/')) {
    const first = s.split('/')[0].trim()
    const n = Number(first)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const parseWeightValue = (raw: unknown): number => {
  const n = Number(safeString(raw).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const calculateClusterBlocksVolume = (cluster: unknown): number => {
  if (!isRecord(cluster)) return 0
  const source = Array.isArray(cluster.blocksDetailed) ? cluster.blocksDetailed
    : Array.isArray(cluster.blocks) ? cluster.blocks : null
  if (!source || source.length === 0) return 0
  let vol = 0
  for (const block of source) {
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    const w = parseWeightValue(b.weight)
    const r = parseRepsValue(b.reps)
    if (w > 0 && r > 0) vol += w * r
  }
  return vol
}

export const calculateTotalVolume = (logs: unknown) => {
  try {
    const safeLogs = logs && typeof logs === 'object' ? (logs as LogsMap) : {}
    let volume = 0
    Object.values(safeLogs).forEach((log) => {
      if (!log || typeof log !== 'object') return
      const logObj = log as Record<string, unknown>
      // Cluster: each block may have different weight
      const clusterVol = calculateClusterBlocksVolume(logObj.cluster)
      if (clusterVol > 0) { volume += clusterVol; return }
      // Standard set
      const w = parseWeightValue((log as WorkoutLogEntry).weight)
      const r = parseRepsValue((log as WorkoutLogEntry).reps)
      if (w > 0 && r > 0) volume += w * r
    })
    return volume
  } catch {
    return 0
  }
}


// ── B: improved fallback — same MET model as the local estimate ───────────────
export const computeFallbackKcal = ({
  session,
  volume,
  weightKg,
}: {
  session: unknown
  volume: number
  weightKg?: number | null
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

    // Use the proper MET estimator (handles weight, complexity, active time)
    const kcal = estimateCaloriesMet(logs, durationMinutes, weightKg, exerciseNames)
    if (kcal > 0) return kcal

    // Dead-last resort (no logs at all)
    return Math.round(volume * 0.02 + durationMinutes * 4)
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
}: {
  session: unknown
  workoutId?: unknown
  rpe?: number | null
}) => {
  try {
    const s = session && typeof session === 'object' ? (session as UnknownRecord) : {}
    const logs = s.logs && typeof s.logs === 'object' ? (s.logs as LogsMap) : {}
    const volume = calculateTotalVolume(logs)
    const preCheckinWeightKg = extractPreCheckinWeight(s)
    const fallback = computeFallbackKcal({ session: s, volume, weightKg: preCheckinWeightKg })

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
    const logs = s.logs && typeof s.logs === 'object' ? (s.logs as LogsMap) : {}
    const volume = calculateTotalVolume(logs)
    const preCheckinWeightKg = extractPreCheckinWeight(s)
    return computeFallbackKcal({ session: s, volume, weightKg: preCheckinWeightKg })
  }
}

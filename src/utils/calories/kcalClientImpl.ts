type UnknownRecord = Record<string, unknown>

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

export const calculateTotalVolume = (logs: unknown) => {
  try {
    const safeLogs = logs && typeof logs === 'object' ? (logs as LogsMap) : {}
    let volume = 0
    Object.values(safeLogs).forEach((log) => {
      if (!log || typeof log !== 'object') return
      const w = Number(safeString((log as WorkoutLogEntry).weight).replace(',', '.'))
      const r = Number(safeString((log as WorkoutLogEntry).reps).replace(',', '.'))
      if (!Number.isFinite(w) || !Number.isFinite(r)) return
      if (w <= 0 || r <= 0) return
      volume += w * r
    })
    return volume
  } catch {
    return 0
  }
}

export const computeFallbackKcal = ({ session, volume }: { session: unknown; volume: number }) => {
  try {
    const s = session && typeof session === 'object' ? (session as UnknownRecord) : {}
    const outdoorBike = s.outdoorBike && typeof s.outdoorBike === 'object' ? (s.outdoorBike as UnknownRecord) : null
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)
    const durationMinutes = (Number(s.totalTime) || 0) / 60
    return Math.round(volume * 0.02 + durationMinutes * 4)
  } catch {
    return 0
  }
}

export const getKcalEstimate = async ({ session, workoutId }: { session: unknown; workoutId?: unknown }) => {
  try {
    const s = session && typeof session === 'object' ? (session as UnknownRecord) : {}
    const logs = s.logs && typeof s.logs === 'object' ? (s.logs as LogsMap) : {}
    const volume = calculateTotalVolume(logs)
    const fallback = computeFallbackKcal({ session: s, volume })
    const resp = await fetch('/api/calories/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: s, workoutId: typeof workoutId === 'string' ? workoutId : null }),
    })
    const json = await resp.json().catch((): any => null)
    const kcal = Number((json as Record<string, unknown>)?.kcal)
    if (!resp.ok) return fallback
    if (!Number.isFinite(kcal) || kcal <= 0) return fallback
    return Math.round(kcal)
  } catch {
    const s = session && typeof session === 'object' ? (session as UnknownRecord) : {}
    const logs = s.logs && typeof s.logs === 'object' ? (s.logs as LogsMap) : {}
    const volume = calculateTotalVolume(logs)
    return computeFallbackKcal({ session: s, volume })
  }
}

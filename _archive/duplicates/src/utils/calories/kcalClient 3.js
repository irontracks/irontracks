const safeString = (v) => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

export const calculateTotalVolume = (logs) => {
  try {
    const safeLogs = logs && typeof logs === 'object' ? logs : {}
    let volume = 0
    Object.values(safeLogs).forEach((log) => {
      if (!log || typeof log !== 'object') return
      const w = Number(safeString(log.weight).replace(',', '.'))
      const r = Number(safeString(log.reps).replace(',', '.'))
      if (!Number.isFinite(w) || !Number.isFinite(r)) return
      if (w <= 0 || r <= 0) return
      volume += w * r
    })
    return volume
  } catch {
    return 0
  }
}

export const computeFallbackKcal = ({ session, volume }) => {
  try {
    const outdoorBike = session?.outdoorBike && typeof session.outdoorBike === 'object' ? session.outdoorBike : null
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)
    const durationMinutes = (Number(session?.totalTime) || 0) / 60
    return Math.round(volume * 0.02 + durationMinutes * 4)
  } catch {
    return 0
  }
}

export const getKcalEstimate = async ({ session, workoutId }) => {
  try {
    const logs = session?.logs && typeof session.logs === 'object' ? session.logs : {}
    const volume = calculateTotalVolume(logs)
    const fallback = computeFallbackKcal({ session, volume })
    const resp = await fetch('/api/calories/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, workoutId: typeof workoutId === 'string' ? workoutId : null }),
    })
    const json = await resp.json().catch(() => null)
    const kcal = Number(json?.kcal)
    if (!resp.ok) return fallback
    if (!Number.isFinite(kcal) || kcal <= 0) return fallback
    return Math.round(kcal)
  } catch {
    const logs = session?.logs && typeof session.logs === 'object' ? session.logs : {}
    const volume = calculateTotalVolume(logs)
    return computeFallbackKcal({ session, volume })
  }
}


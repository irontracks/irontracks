/**
 * Shared formatting & utility functions for the report system.
 * Single source of truth — used by both WorkoutReport.tsx (React) and buildHtml.ts (PDF).
 */

// ─── Type guard ──────────────────────────────────────────────────────────────

export const isRecord = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

// ─── Date formatting ─────────────────────────────────────────────────────────

/**
 * Resolve a Firestore timestamp, Date, number, or string into a Date object.
 * Returns null if the input is invalid.
 */
export const resolveDate = (ts: unknown): Date | null => {
    if (!ts) return null
    const obj = isRecord(ts) ? ts : null
    const toDateFn = obj && typeof obj.toDate === 'function' ? (obj.toDate as () => unknown) : null
    const raw = toDateFn
        ? toDateFn()
        : new Date(typeof ts === 'number' || typeof ts === 'string' || ts instanceof Date ? ts : String(ts))
    if (!(raw instanceof Date) || Number.isNaN(raw.getTime())) return null
    return raw
}

export const formatDate = (ts: unknown): string => {
    const d = resolveDate(ts)
    if (!d) return ''
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const formatShortDate = (ts: unknown): string => {
    const d = resolveDate(ts)
    if (!d) return ''
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// ─── Duration & numbers ──────────────────────────────────────────────────────

export const formatDuration = (s: unknown): string => {
    const safe = Number(s) || 0
    const mins = Math.floor(safe / 60)
    const secs = Math.floor(safe % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export const formatKm = (meters: unknown): string => {
    const m = Number(meters)
    if (!Number.isFinite(m) || m <= 0) return '-'
    return `${(m / 1000).toFixed(2)} km`
}

export const formatKmh = (kmh: unknown): string => {
    const v = Number(kmh)
    if (!Number.isFinite(v) || v <= 0) return '-'
    return `${v.toFixed(1)} km/h`
}

// ─── Exercise key ─────────────────────────────────────────────────────────────

export const normalizeExerciseKey = (v: unknown): string => {
    try {
        return String(v || '').trim().toLowerCase().replace(/\s+/g, ' ')
    } catch {
        return ''
    }
}

// ── Volume calculation ──────────────────────────────────────────────────────

/**
 * Parse reps value that may be in "done/planned" format (e.g. "8/10" → 8).
 * Also handles comma decimals and plain numbers.
 */
const parseRepsValue = (raw: unknown): number => {
    const s = String(raw ?? '').replace(',', '.').trim()
    if (!s) return 0
    // Handle "done/planned" format: "8/10" → take the first number (done reps)
    if (s.includes('/')) {
        const first = s.split('/')[0].trim()
        const n = Number(first)
        return Number.isFinite(n) && n > 0 ? n : 0
    }
    const n = Number(s)
    return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Parse weight value (handles comma decimals).
 */
const parseWeightValue = (raw: unknown): number => {
    const s = String(raw ?? '').replace(',', '.').trim()
    const n = Number(s)
    return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Calculate volume from cluster blocks (each block has its own weight × reps).
 */
const calculateClusterVolume = (cluster: unknown): number => {
    if (!isRecord(cluster)) return 0
    const blocksDetailed = Array.isArray(cluster.blocksDetailed) ? cluster.blocksDetailed : null
    const blocks = Array.isArray(cluster.blocks) ? cluster.blocks : null
    const source = blocksDetailed || blocks
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

export const calculateTotalVolume = (logs: unknown): number => {
    try {
        let volume = 0
        const safeLogs: Record<string, unknown> = isRecord(logs) ? logs : {}
        Object.values(safeLogs).forEach((log: unknown) => {
            if (!isRecord(log)) return

            // Check for cluster data first (each block may have different weight)
            const clusterVol = calculateClusterVolume(log.cluster)
            if (clusterVol > 0) {
                volume += clusterVol
                return
            }

            // Standard set: weight × reps
            const w = parseWeightValue(log.weight)
            const r = parseRepsValue(log.reps)
            if (w > 0 && r > 0) volume += w * r
        })
        return volume
    } catch {
        return 0
    }
}


/**
 * POST /api/calories/estimate
 *
 * Estimates calories burned for a workout session using a deterministic
 * physics-based MET formula. Gemini AI was intentionally removed from this
 * endpoint because:
 *  1. Non-deterministic: each call returned a different MET value.
 *  2. Volume-blind: it received exercise names but not actual load/volume data.
 *  3. Caused oscillation: the page would show one value on load, then another
 *     after the API response arrived, then yet another when postCheckin loaded.
 *
 * The formula is fully deterministic:
 *   kcal = MET(load, density) × complexity × bodyWeight × activeHours × rpe
 *        + MET_REST × bodyWeight × restHours
 */
import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  estimateCaloriesMet,
  getExerciseComplexityFactor,
  selectMet,
  getRpeMultiplier,
  getEpocFactor,
  MET_REST,
  DEFAULT_BODY_WEIGHT_KG,
} from '@/utils/calories/metEstimate'

const ZodBodySchema = z
  .object({
    session: z.unknown(),
    workoutId: z.string().optional(),
    rpe: z.number().min(1).max(10).optional().nullable(),
    preCheckinWeightKg: z.number().min(20).max(300).optional().nullable(),
  })
  .strip()

const safeString = (v: unknown): string => {
  try { return String(v ?? '').trim() } catch { return '' }
}

const calculateTotalVolume = (logs: Record<string, unknown>) => {
  try {
    let volume = 0
    Object.values(logs).forEach((log: unknown) => {
      if (!log || typeof log !== 'object') return
      const row = log as Record<string, unknown>
      const w = Number(safeString(row.weight).replace(',', '.'))
      const r = Number(safeString(row.reps).replace(',', '.'))
      if (!Number.isFinite(w) || !Number.isFinite(r)) return
      if (w <= 0 || r <= 0) return
      volume += w * r
    })
    return volume
  } catch { return 0 }
}

const computeRestSecondsFromLogs = (logs: Record<string, unknown>): number => {
  let total = 0
  for (const v of Object.values(logs)) {
    if (!v || typeof v !== 'object') continue
    const obj = v as Record<string, unknown>
    const rs = Number(obj?.restSeconds)
    if (Number.isFinite(rs) && rs > 0 && rs < 600) total += rs
  }
  return total
}

// ── Weight from DB assessment (fallback when preCheckin has no weight) ─────────
const getLatestWeightKg = async ({ supabase, targetUserId }: { supabase: SupabaseClient; targetUserId: string }) => {
  try {
    const { data } = await supabase
      .from('assessments')
      .select('weight, created_at')
      .or(`student_id.eq.${targetUserId},user_id.eq.${targetUserId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const w = Number((data as Record<string, unknown>)?.weight)
    return Number.isFinite(w) && w > 0 ? w : null
  } catch { return null }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsedBody = await parseJsonBody(request, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const session = body?.session && typeof body.session === 'object' ? (body.session as Record<string, unknown>) : null
    const workoutId = typeof body?.workoutId === 'string' ? body.workoutId : null

    const clientRpe = body?.rpe != null ? Number(body.rpe) : null
    const clientWeightKg = body?.preCheckinWeightKg != null ? Number(body.preCheckinWeightKg) : null

    if (!session) return NextResponse.json({ ok: false, error: 'missing session' }, { status: 400 })

    // Bike activity: use recorded kcal directly
    const outdoorBike = session?.outdoorBike && typeof session.outdoorBike === 'object'
      ? (session.outdoorBike as Record<string, unknown>) : null
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) {
      return NextResponse.json({ ok: true, kcal: Math.round(bikeKcal), source: 'bike' })
    }

    // Resolve target user (for trainer sessions)
    let targetUserId = user.id
    if (workoutId) {
      try {
        const { data: row } = await supabase.from('workouts').select('id, user_id').eq('id', workoutId).maybeSingle()
        const uid = safeString((row as Record<string, unknown>)?.user_id)
        if (uid) targetUserId = uid
      } catch { /* silent */ }
    }

    const logs = session?.logs && typeof session.logs === 'object' ? (session.logs as Record<string, unknown>) : {}
    const volume = calculateTotalVolume(logs)

    // ── Timing ────────────────────────────────────────────────────────────────
    const totalTimeSeconds = Number(session?.totalTime) || 0
    const execSeconds = Number(session?.executionTotalSeconds ?? session?.execution_total_seconds ?? 0) || 0
    const restSecondsSession = Number(session?.restTotalSeconds ?? session?.rest_total_seconds ?? 0) || 0
    const restSeconds = restSecondsSession > 0 ? restSecondsSession : computeRestSecondsFromLogs(logs)

    const execMinutes = execSeconds > 0 ? execSeconds / 60 : 0
    const restMinutes = restSeconds > 0 ? restSeconds / 60 : 0
    const totalMinutes = execMinutes + restMinutes > 0
      ? execMinutes + restMinutes
      : totalTimeSeconds > 0 ? totalTimeSeconds / 60 : 0

    // Active minutes: prefer explicit exec time, else total – rest (min 35% of total)
    const activeMinutes = execMinutes > 0 ? execMinutes
      : totalMinutes > 0 ? Math.max(totalMinutes - restMinutes, totalMinutes * 0.35)
      : 0

    // ── Body weight priority chain ────────────────────────────────────────────
    // 1. preCheckin weight (client payload — most accurate, entered right before session)
    // 2. session.preCheckin (saved in session object when started)
    // 3. Latest DB assessment (historical)
    // 4. Default 75 kg
    const preCheckinWeight = (() => {
      if (clientWeightKg && Number.isFinite(clientWeightKg) && clientWeightKg >= 20 && clientWeightKg <= 300)
        return clientWeightKg
      const pc = session?.preCheckin && typeof session.preCheckin === 'object'
        ? (session.preCheckin as Record<string, unknown>) : null
      const pcW = Number(pc?.weight ?? pc?.body_weight_kg ?? (pc?.answers as Record<string, unknown>)?.body_weight_kg)
      if (Number.isFinite(pcW) && pcW >= 20 && pcW <= 300) return pcW
      return null
    })()

    const assessmentWeight = preCheckinWeight == null
      ? await getLatestWeightKg({ supabase, targetUserId })
      : null

    const bodyWeightKg = preCheckinWeight ?? assessmentWeight ?? DEFAULT_BODY_WEIGHT_KG
    const weightSource = preCheckinWeight != null ? 'pre_checkin'
      : assessmentWeight != null ? 'assessment'
      : 'default_75kg'

    // ── Exercise names and per-exercise volumes (for weighted complexity) ────
    const exerciseNames = Array.isArray(session?.exercises)
      ? (session.exercises as unknown[]).map((ex) => {
        const e = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null
        return String(e?.name || '').trim()
      }).filter(Boolean) as string[]
      : []

    // Volume per exercise: sum(w × r) for all sets of that exercise
    // Logs are keyed by "exerciseIdx-setIdx"
    const exerciseVolumes: number[] = exerciseNames.map((_, exIdx) => {
      let vol = 0
      for (const [key, log] of Object.entries(logs)) {
        const parts = key.split('-')
        if (Number(parts[0]) !== exIdx) continue
        if (!log || typeof log !== 'object') continue
        const obj = log as Record<string, unknown>
        const w = Number(safeString(obj?.weight as unknown).replace(',', '.'))
        const r = Number(safeString(obj?.reps as unknown).replace(',', '.'))
        if (w > 0 && r > 0) vol += w * r
      }
      return vol
    })

    // Volume-weighted complexity factor (heavy compounds get proportional weight)
    const totalExVol = exerciseVolumes.reduce((a, b) => a + b, 0)
    const complexityFactor = exerciseNames.length > 0
      ? (() => {
          if (totalExVol > 0) {
            return exerciseNames.reduce((acc, name, i) =>
              acc + getExerciseComplexityFactor(name) * exerciseVolumes[i], 0) / totalExVol
          }
          return exerciseNames.map(getExerciseComplexityFactor).reduce((a, b) => a + b, 0) / exerciseNames.length
        })()
      : 1.0

    // ── MET: two-factor (load AND density) ───────────────────────────────────
    let avgLoadPerRep = 0
    let totalWeightedReps = 0
    let totalReps = 0
    for (const v of Object.values(logs)) {
      if (!v || typeof v !== 'object') continue
      const obj = v as Record<string, unknown>
      const w = Number(safeString(obj?.weight as unknown).replace(',', '.'))
      const r = Number(safeString(obj?.reps as unknown).replace(',', '.'))
      if (w > 0 && r > 0) { totalWeightedReps += w * r; totalReps += r }
    }
    avgLoadPerRep = totalReps > 0 ? totalWeightedReps / totalReps : 0

    const met = selectMet(avgLoadPerRep, volume, activeMinutes)

    // ── RPE multiplier ────────────────────────────────────────────────────────
    const rpeVal = clientRpe != null && Number.isFinite(clientRpe) ? clientRpe : null
    const rpeMultiplier = getRpeMultiplier(rpeVal)

    // ── EPOC factor ────────────────────────────────────────────────────────────
    const epocFactor = getEpocFactor(met, totalMinutes)

    // ── Final kcal (deterministic) ────────────────────────────────────────────
    // If we have no timing data, use the convenience wrapper
    if (totalMinutes <= 0) {
      return NextResponse.json({
        ok: true,
        kcal: 0,
        source: 'no_duration',
        weightSource,
      })
    }

    const activeHours = activeMinutes / 60
    const restHours = restMinutes / 60
    const kcalBase = met * complexityFactor * bodyWeightKg * activeHours * rpeMultiplier
      + MET_REST * bodyWeightKg * restHours
    const kcal = Math.round(kcalBase * epocFactor)

    return NextResponse.json({
      ok: true,
      kcal: Math.max(0, kcal),
      met: Math.round(met * 10) / 10,
      complexityFactor: Math.round(complexityFactor * 100) / 100,
      bodyWeightKg,
      activeMinutes: Math.round(activeMinutes * 10) / 10,
      restMinutes: Math.round(restMinutes * 10) / 10,
      rpeMultiplier,
      epocFactor,
      source: 'deterministic-met',
      weightSource,
    })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

/**
 * POST /api/calories/estimate
 *
 * Estimates calories burned for a workout session using a deterministic
 * multi-factor MET formula. V3 — properly calibrated to produce
 * 200–700 kcal for resistance training sessions.
 *
 * Factors: duration, body weight, sex, volume density, training style,
 * exercise complexity, RPE, EPOC.
 */
import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  estimateCaloriesMet,
  estimateDurationFromLogs,
  selectBaseMet,
  getExerciseComplexityFactor,
  getRpeMultiplier,
  getEpocFactor,
  getStyleFactor,
  detectTrainingStyle,
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

const parseRepsValue = (raw: unknown): number => {
  const s = safeString(raw).replace(',', '.')
  if (!s) return 0
  if (s.includes('/')) {
    const n = Number(s.split('/')[0].trim())
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const parseWeightValue = (raw: unknown): number => {
  const n = Number(safeString(raw).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

const calculateClusterVolume = (cluster: unknown): number => {
  if (!cluster || typeof cluster !== 'object') return 0
  const c = cluster as Record<string, unknown>
  const source = Array.isArray(c.blocksDetailed) ? c.blocksDetailed
    : Array.isArray(c.blocks) ? c.blocks : null
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

const calculateTotalVolume = (logs: Record<string, unknown>) => {
  try {
    let volume = 0
    Object.values(logs).forEach((log: unknown) => {
      if (!log || typeof log !== 'object') return
      const row = log as Record<string, unknown>
      // Cluster: each block may have different weight
      const clusterVol = calculateClusterVolume(row.cluster)
      if (clusterVol > 0) { volume += clusterVol; return }
      // Standard set
      const w = parseWeightValue(row.weight)
      const r = parseRepsValue(row.reps)
      if (w > 0 && r > 0) volume += w * r
    })
    return volume
  } catch { return 0 }
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

    // ── Body weight priority chain ──────────────────────────────────────────
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
      : 'default'

    // ── Biological sex from user settings ───────────────────────────────────
    const biologicalSex = await (async () => {
      try {
        const { data: row } = await supabase
          .from('user_settings')
          .select('preferences')
          .eq('user_id', targetUserId)
          .maybeSingle()
        const prefs = row?.preferences && typeof row.preferences === 'object'
          ? (row.preferences as Record<string, unknown>) : null
        const sex = safeString(prefs?.biologicalSex)
        return sex === 'male' || sex === 'female' ? sex : null
      } catch { return null }
    })()

    // ── Timing ──────────────────────────────────────────────────────────────
    const totalTimeSeconds = Number(session?.totalTime) || 0
    const execSeconds = Number(session?.executionTotalSeconds ?? session?.execution_total_seconds ?? 0) || 0
    const restSecondsSession = Number(session?.restTotalSeconds ?? session?.rest_total_seconds ?? 0) || 0
    const totalMinutes = totalTimeSeconds > 0 ? totalTimeSeconds / 60 : 0
    const execMinutesOverride = execSeconds > 0 ? execSeconds / 60 : null
    const restMinutesOverride = restSecondsSession > 0 ? restSecondsSession / 60 : null

    // ── Exercise names ──────────────────────────────────────────────────────
    const exerciseNames = Array.isArray(session?.exercises)
      ? (session.exercises as unknown[]).map((ex) => {
        const e = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : null
        return String(e?.name || '').trim()
      }).filter(Boolean) as string[]
      : []

    // Volume per exercise (handles "done/planned" reps like "8/10" and cluster blocks)
    const exerciseVolumes: number[] = exerciseNames.map((_, exIdx) => {
      let vol = 0
      for (const [key, log] of Object.entries(logs)) {
        const parts = key.split('-')
        if (Number(parts[0]) !== exIdx) continue
        if (!log || typeof log !== 'object') continue
        const obj = log as Record<string, unknown>
        const clusterVol = calculateClusterVolume(obj.cluster)
        if (clusterVol > 0) { vol += clusterVol; continue }
        const w = parseWeightValue(obj?.weight)
        const r = parseRepsValue(obj?.reps)
        if (w > 0 && r > 0) vol += w * r
      }
      return vol
    })

    // ── Started at (for timestamp fallback) ─────────────────────────────────
    const startedAtMs = (() => {
      const raw = session?.startedAt ?? session?.startedAtMs ?? session?.started_at
      const n = Number(raw)
      return Number.isFinite(n) && n > 0 ? n : null
    })()

    // ── Delegate to estimateCaloriesMet (handles all multi-factor logic) ───
    const kcal = estimateCaloriesMet(
      logs,
      totalMinutes,
      bodyWeightKg,
      exerciseNames.length > 0 ? exerciseNames : null,
      clientRpe,
      execMinutesOverride,
      restMinutesOverride,
      biologicalSex,
      exerciseVolumes.length > 0 ? exerciseVolumes : null,
      startedAtMs,
    )

    return NextResponse.json({
      ok: true,
      kcal,
      volume,
      bodyWeightKg,
      durationMinutes: Math.round(totalMinutes * 10) / 10,
      source: 'v3-multi-factor',
      weightSource,
    })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

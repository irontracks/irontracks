import { NextResponse } from 'next/server'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

const ZodBodySchema = z
  .object({
    session: z.unknown(),
    workoutId: z.string().optional(),
    // New: pass rpe and preCheckin weight directly from client
    rpe: z.number().min(1).max(10).optional().nullable(),
    preCheckinWeightKg: z.number().min(20).max(300).optional().nullable(),
  })
  .strip()

const safeString = (v: unknown): string => {
  try {
    return String(v ?? '').trim()
  } catch {
    return ''
  }
}

const clampNumber = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const extractJsonFromText = (text: string) => {
  try {
    const s = safeString(text)
    if (!s) return null
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start < 0 || end < 0 || end <= start) return null
    const candidate = s.slice(start, end + 1)
    return parseJsonWithSchema(candidate, z.record(z.unknown()))
  } catch {
    return null
  }
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
  } catch {
    return 0
  }
}

// ── D: compute rest from individual set logs when session-level totals are missing ──
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

// ── B: improved fallback, no longer a simple linear formula ──────────────────
const MET_LIGHT = 3.5
const MET_MODERATE = 5.0
const MET_VIGOROUS = 6.0
const DEFAULT_BW = 75

const computeFallbackKcal = ({
  session,
  volume,
  weightKg,
}: {
  session: Record<string, unknown>
  volume: number
  weightKg?: number | null
}) => {
  try {
    const outdoorBike =
      session?.outdoorBike && typeof session.outdoorBike === 'object' ? (session.outdoorBike as Record<string, unknown>) : null
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)

    const bw =
      weightKg != null && Number.isFinite(weightKg) && weightKg >= 20 && weightKg <= 300
        ? weightKg
        : DEFAULT_BW

    const logs = session?.logs && typeof session.logs === 'object' ? (session.logs as Record<string, unknown>) : {}
    const execSeconds = Number(session?.executionTotalSeconds ?? session?.execution_total_seconds ?? 0) || 0
    const restSecondsSession = Number(session?.restTotalSeconds ?? session?.rest_total_seconds ?? 0) || 0
    // D: fall back to per-set rest if session-level totals are missing
    const restSeconds = restSecondsSession > 0 ? restSecondsSession : computeRestSecondsFromLogs(logs)
    const totalTime = (Number(session?.totalTime) || 0) / 60
    const totalMinutes =
      execSeconds + restSeconds > 0
        ? (execSeconds + restSeconds) / 60
        : totalTime

    const activeMinutes = execSeconds > 0
      ? execSeconds / 60
      : Math.max(totalMinutes - restSeconds / 60, totalMinutes * 0.35)

    // MET from average load (same scale as local metEstimate)
    const logEntries = Object.values(logs)
    let totalWeightedReps = 0
    let totalReps = 0
    for (const v of logEntries) {
      if (!v || typeof v !== 'object') continue
      const obj = v as Record<string, unknown>
      const w = Number(safeString(obj?.weight as unknown).replace(',', '.'))
      const r = Number(safeString(obj?.reps as unknown).replace(',', '.'))
      if (w > 0 && r > 0) { totalWeightedReps += w * r; totalReps += r }
    }
    const avgLoad = totalReps > 0 ? totalWeightedReps / totalReps : 0
    const met = avgLoad < 20 ? MET_LIGHT : avgLoad < 50 ? MET_MODERATE : MET_VIGOROUS

    // During rest, MET ≈ 1.5 (standing/seated recovery)
    const restHours = (restSeconds / 60) / 60
    const activeHours = activeMinutes / 60
    const kcal = Math.round(met * bw * activeHours + 1.5 * bw * restHours)
    return kcal > 0 ? kcal : Math.round(volume * 0.02 + totalMinutes * 4) // last resort
  } catch {
    return 0
  }
}

// ── A: weight priority: preCheckin > assessments > default ───────────────────
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
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`ai:calories:${user.id}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(request, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const session = body?.session && typeof body.session === 'object' ? (body.session as Record<string, unknown>) : null
    const workoutId = typeof body?.workoutId === 'string' ? body.workoutId : null

    // C: RPE and preCheckin weight from client payload
    const clientRpe = body?.rpe != null ? Number(body.rpe) : null
    const clientWeightKg = body?.preCheckinWeightKg != null ? Number(body.preCheckinWeightKg) : null

    if (!session) return NextResponse.json({ ok: false, error: 'missing session' }, { status: 400 })

    const outdoorBike =
      session?.outdoorBike && typeof session.outdoorBike === 'object' ? (session.outdoorBike as Record<string, unknown>) : null
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) {
      return NextResponse.json({ ok: true, kcal: Math.round(bikeKcal), source: 'bike' })
    }

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

    // ── D: compute time with fallback to per-set rest seconds ──────────────
    const totalTimeSeconds = Number(session?.totalTime) || 0
    const execSeconds = Number(session?.executionTotalSeconds ?? session?.execution_total_seconds ?? 0) || 0
    const restSecondsSession = Number(session?.restTotalSeconds ?? session?.rest_total_seconds ?? 0) || 0
    const restSeconds = restSecondsSession > 0 ? restSecondsSession : computeRestSecondsFromLogs(logs)
    const executionMinutes = execSeconds > 0 ? execSeconds / 60 : 0
    const restMinutes = restSeconds > 0 ? restSeconds / 60 : 0
    const minutes =
      executionMinutes + restMinutes > 0
        ? executionMinutes + restMinutes
        : totalTimeSeconds > 0
          ? totalTimeSeconds / 60
          : 0

    // ── A: weight priority chain ─────────────────────────────────────────────
    // 1. preCheckin weight (most recent, entered just before this session)
    // 2. latest assessment from DB
    // 3. None (fallback)
    const preCheckinWeight = (() => {
      // from client payload
      if (clientWeightKg && Number.isFinite(clientWeightKg) && clientWeightKg >= 20 && clientWeightKg <= 300)
        return clientWeightKg
      // from session.preCheckin (when session was started and preCheckin was saved in ui)
      const pc = session?.preCheckin && typeof session.preCheckin === 'object'
        ? (session.preCheckin as Record<string, unknown>) : null
      const pcW = Number(pc?.weight ?? pc?.body_weight_kg ?? (pc?.answers as Record<string, unknown>)?.body_weight_kg)
      if (Number.isFinite(pcW) && pcW >= 20 && pcW <= 300) return pcW
      return null
    })()

    const assessmentWeight = preCheckinWeight == null
      ? await getLatestWeightKg({ supabase, targetUserId })
      : null

    const weightKg = preCheckinWeight ?? assessmentWeight

    const fallback = computeFallbackKcal({ session, volume, weightKg })
    if (!(minutes > 0)) return NextResponse.json({ ok: true, kcal: fallback, source: 'fallback' })
    if (!weightKg) return NextResponse.json({ ok: true, kcal: fallback, source: 'fallback' })

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: true, kcal: fallback, source: 'fallback' })
    const modelId = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

    // ── C: enrich prompt with RPE and exercise type context ─────────────────
    const rpeContext = clientRpe != null && Number.isFinite(clientRpe)
      ? `\nRPE pós-treino: ${clientRpe}/10 (percepção de esforço do atleta).`
      : ''

    const prompt =
      'Você é um especialista em fisiologia do exercício. Estime a intensidade do treino em MET.' +
      ' Retorne APENAS um JSON válido (sem markdown), no formato:' +
      ' {"metMin": number, "metMax": number, "confidence": "low"|"medium"|"high", "assumptions": string[] }.' +
      ' Regras: metMin e metMax devem estar entre 1 e 20; metMin <= metMax; assumptions max 5.' +
      ' Leve em conta o tipo de exercício (compostos livres = maior MET; máquinas de isolamento = menor MET).' +
      ' Não invente dados fisiológicos. Se informação for insuficiente, use confidence="low" e metMin/metMax conservadores.' +
      rpeContext +
      '\n\nTREINO (JSON):\n' +
      JSON.stringify({
        title: safeString(session?.workoutTitle as string || session?.name as string || ''),
        minutes: Math.round((executionMinutes > 0 ? executionMinutes : minutes) * 10) / 10,
        restMinutes: Math.round(restMinutes * 10) / 10,
        weightKg,
        volumeKg: Math.round(volume),
        weightSource: preCheckinWeight != null ? 'pre_checkin' : 'assessment',
        exercises: Array.isArray(session?.exercises)
          ? (session.exercises as unknown[]).slice(0, 30).map((ex: unknown) => {
            const row = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : {}
            return {
              name: safeString(row?.name),
              sets: Number(row?.sets) || null,
              method: safeString(row?.method),
              rest: Number(row?.restTime ?? row?.rest_time) || null,
            }
          })
          : [],
      })

    let met = null as null | { metMin: number; metMax: number; confidence: string; assumptions: string[] }
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: modelId })
      const result = await model.generateContent(prompt)
      const text = (await result?.response?.text()) || ''
      const parsed = extractJsonFromText(text)
      const parsedObj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
      const metMin = Number(parsedObj?.metMin)
      const metMax = Number(parsedObj?.metMax)
      if (!Number.isFinite(metMin) || !Number.isFinite(metMax)) throw new Error('invalid_met')
      const mn = clampNumber(metMin, 1, 20)
      const mx = clampNumber(metMax, 1, 20)
      const lo = Math.min(mn, mx)
      const hi = Math.max(mn, mx)
      const conf = safeString(parsedObj?.confidence)
      const confidence = conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'low'
      const assumptions = Array.isArray(parsedObj?.assumptions)
        ? (parsedObj.assumptions as unknown[]).map((x: unknown) => safeString(x)).filter((x: string) => x).slice(0, 5)
        : []
      met = { metMin: lo, metMax: hi, confidence, assumptions }
    } catch {
      met = null
    }

    if (!met) return NextResponse.json({ ok: true, kcal: fallback, source: 'fallback' })

    // ── C: apply RPE multiplier to the Gemini MET result ────────────────────
    const rpeMultiplier = (() => {
      if (!clientRpe || !Number.isFinite(clientRpe)) return 1.0
      const r = Math.max(1, Math.min(10, Math.round(clientRpe)))
      if (r <= 3) return 0.80
      if (r === 4) return 0.87
      if (r === 5) return 0.92
      if (r === 6) return 0.96
      if (r <= 8) return 1.00
      if (r === 9) return 1.08
      return 1.15
    })()

    const metRest = 1.5
    const execHours = (executionMinutes > 0 ? executionMinutes : minutes) / 60
    const restHours = restMinutes / 60
    const kcalMin = Math.round((met.metMin * weightKg * execHours + metRest * weightKg * restHours) * rpeMultiplier)
    const kcalMax = Math.round((met.metMax * weightKg * execHours + metRest * weightKg * restHours) * rpeMultiplier)
    const kcal = Math.round((kcalMin + kcalMax) / 2)

    const safeKcalMin = Math.max(0, kcalMin)
    const safeKcalMax = Math.max(safeKcalMin, kcalMax)
    const safeKcal = clampNumber(kcal, safeKcalMin, safeKcalMax)

    return NextResponse.json({
      ok: true,
      kcal: safeKcal,
      kcalMin: safeKcalMin,
      kcalMax: safeKcalMax,
      confidence: met.confidence,
      assumptions: met.assumptions,
      source: 'gemini-met',
      weightSource: preCheckinWeight != null ? 'pre_checkin' : 'assessment',
    })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

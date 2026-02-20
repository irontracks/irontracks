import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { SupabaseClient } from '@supabase/supabase-js'

const ZodBodySchema = z
  .object({
    session: z.unknown(),
    workoutId: z.string().optional(),
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
    return JSON.parse(candidate)
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

const computeFallbackKcal = ({ session, volume }: { session: Record<string, unknown>; volume: number }) => {
  try {
    const outdoorBike =
      session?.outdoorBike && typeof session.outdoorBike === 'object' ? (session.outdoorBike as Record<string, unknown>) : null
    const bikeKcal = Number(outdoorBike?.caloriesKcal)
    if (Number.isFinite(bikeKcal) && bikeKcal > 0) return Math.round(bikeKcal)
    const durationMinutes = (Number(session?.totalTime) || 0) / 60
    return Math.round(volume * 0.02 + durationMinutes * 4)
  } catch {
    return 0
  }
}

const getLatestWeightKg = async ({ supabase, targetUserId }: { supabase: SupabaseClient; targetUserId: string }) => {
  try {
    const { data, error } = await supabase
      .from('assessments')
      .select('weight, created_at, measured_at, date, student_id, user_id')
      .or(`student_id.eq.${targetUserId},user_id.eq.${targetUserId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return null
    const w = Number((data as Record<string, unknown>)?.weight)
    if (!Number.isFinite(w) || w <= 0) return null
    return w
  } catch {
    try {
      const { data, error } = await supabase
        .from('assessments')
        .select('weight, created_at, measured_at, date, student_id')
        .eq('student_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) return null
      const w = Number((data as Record<string, unknown>)?.weight)
      if (!Number.isFinite(w) || w <= 0) return null
      return w
    } catch {
      try {
        const { data, error } = await supabase
          .from('assessments')
          .select('weight, created_at, measured_at, date, user_id')
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) return null
        const w = Number((data as Record<string, unknown>)?.weight)
        if (!Number.isFinite(w) || w <= 0) return null
        return w
      } catch {
        return null
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsedBody = await parseJsonBody(request, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const session = body?.session && typeof body.session === 'object' ? (body.session as Record<string, unknown>) : null
    const workoutId = typeof body?.workoutId === 'string' ? body.workoutId : null
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
      } catch {
      }
    }

    const logs = session?.logs && typeof session.logs === 'object' ? (session.logs as Record<string, unknown>) : {}
    const volume = calculateTotalVolume(logs)
    const totalTimeSeconds = Number(session?.totalTime) || 0
    const minutes = totalTimeSeconds > 0 ? totalTimeSeconds / 60 : 0

    const fallback = computeFallbackKcal({ session, volume })
    if (!(minutes > 0)) return NextResponse.json({ ok: true, kcal: fallback, source: 'fallback' })

    const weightKg = await getLatestWeightKg({ supabase, targetUserId })
    if (!weightKg) return NextResponse.json({ ok: true, kcal: fallback, source: 'fallback' })

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: true, kcal: fallback, source: 'fallback' })

    const modelId = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

    const prompt =
      'Você é um especialista em fisiologia do exercício. Estime a intensidade do treino em MET.' +
      ' Retorne APENAS um JSON válido (sem markdown), no formato:' +
      ' {"metMin": number, "metMax": number, "confidence": "low"|"medium"|"high", "assumptions": string[] }.' +
      ' Regras: metMin e metMax devem estar entre 1 e 20; metMin <= metMax; assumptions max 5.' +
      ' Não invente dados fisiológicos. Se informação for insuficiente, use confidence="low" e metMin/metMax conservadores.' +
      '\n\nTREINO (JSON):\n' +
      JSON.stringify({
        title: safeString(session?.workoutTitle || session?.name || ''),
        minutes: Math.round(minutes * 10) / 10,
        weightKg,
        volumeKg: Math.round(volume),
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

    const hours = minutes / 60
    const kcalMin = Math.round(met.metMin * weightKg * hours)
    const kcalMax = Math.round(met.metMax * weightKg * hours)
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
    })
  } catch (e: any) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

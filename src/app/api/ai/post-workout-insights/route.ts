import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    workoutId: z.string().optional(),
    workout_id: z.string().optional(),
    id: z.string().optional(),
    session: z.unknown().optional(),
  })
  .strip()

const POST_WORKOUT_MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeJsonParse = (raw: string) => parseJsonWithSchema(raw, z.unknown())

const normalizeAi = (obj: unknown) => {
  const base = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {}
  const toArr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [])
  const toStr = (v: unknown) => String(v || '').trim()
  const toRating = (v: unknown) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return null
    const clamped = Math.max(0, Math.min(5, Math.round(n)))
    return clamped
  }
  const prsRaw = Array.isArray(base?.prs) ? base.prs : []
  const progRaw = Array.isArray(base?.progression) ? base.progression : []
  return {
    rating: toRating(base?.rating ?? base?.stars ?? base?.score),
    rating_reason: toStr(base?.rating_reason ?? base?.ratingReason ?? base?.reason).slice(0, 500),
    summary: toArr(base?.summary).slice(0, 8),
    motivation: toStr(base?.motivation).slice(0, 600),
    highlights: toArr(base?.highlights).slice(0, 10),
    warnings: toArr(base?.warnings).slice(0, 10),
    prs: prsRaw
      .map((p: unknown) => {
        const item = p && typeof p === 'object' ? (p as Record<string, unknown>) : {}
        const exercise = toStr(item?.exercise || item?.name)
        const label = toStr(item?.label)
        const value = toStr(item?.value || item?.text)
        if (!exercise && !value) return null
        return { exercise, label, value }
      })
      .filter(Boolean)
      .slice(0, 12),
    progression: progRaw
      .map((p: unknown) => {
        const item = p && typeof p === 'object' ? (p as Record<string, unknown>) : {}
        const exercise = toStr(item?.exercise || item?.name)
        const recommendation = toStr(item?.recommendation || item?.action || item?.text)
        const reason = toStr(item?.reason)
        if (!exercise && !recommendation) return null
        return { exercise, recommendation, reason }
      })
      .filter(Boolean)
      .slice(0, 12),
  }
}

const extractJsonFromModelText = (text: string) => {
  const cleaned = String(text || '').trim()
  if (!cleaned) return null
  const direct = safeJsonParse(cleaned)
  if (direct) return direct
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return safeJsonParse(cleaned.slice(start, end + 1))
}

const computeMetrics = (session: Record<string, unknown>) => {
  try {
    const s = session && typeof session === 'object' ? session : {}
    const logs = s?.logs && typeof s.logs === 'object' ? (s.logs as Record<string, unknown>) : {}
    const exercises = Array.isArray(s?.exercises) ? (s.exercises as unknown[]) : []
    const exNameByIdx = new Map<number, string>()
    exercises.forEach((ex: unknown, idx: number) => {
      const exObj = ex && typeof ex === 'object' ? (ex as Record<string, unknown>) : {}
      const name = String(exObj?.name || '').trim()
      if (!name) return
      exNameByIdx.set(idx, name)
    })

    const parseNum = (v: unknown) => {
      const raw = String(v ?? '').replace(',', '.')
      const n = Number(raw)
      return Number.isFinite(n) ? n : 0
    }

    let totalVolume = 0
    let setsDone = 0
    const volumeByExIdx = new Map<number, number>()
    const exercisesWithLogs = new Set<number>()

    Object.entries(logs).forEach(([k, log]) => {
      if (!log || typeof log !== 'object') return
      const parts = String(k || '').split('-')
      const exIdx = Number(parts[0])
      if (!Number.isFinite(exIdx)) return
      const w = parseNum((log as Record<string, unknown>)?.weight)
      const r = parseNum((log as Record<string, unknown>)?.reps)
      const hasNumbers = w > 0 && r > 0
      const done = Boolean((log as Record<string, unknown>)?.done) || hasNumbers
      if (!done) return
      exercisesWithLogs.add(exIdx)
      setsDone += 1
      if (hasNumbers) {
        const vol = w * r
        if (Number.isFinite(vol) && vol > 0) {
          totalVolume += vol
          volumeByExIdx.set(exIdx, (volumeByExIdx.get(exIdx) || 0) + vol)
        }
      }
    })

    const topExercises = Array.from(volumeByExIdx.entries())
      .sort((a, b) => (b[1] || 0) - (a[1] || 0))
      .slice(0, 3)
      .map(([idx, vol]) => ({
        name: exNameByIdx.get(idx) || `Exercício ${idx + 1}`,
        volumeKg: Math.round(Number(vol) || 0),
      }))

    return {
      totalVolumeKg: Math.round(totalVolume),
      totalSetsDone: setsDone,
      totalExercises: exercisesWithLogs.size,
      topExercises,
    }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:post-workout-insights:${userId}:${ip}`, 15, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
      )
    }

    // Check VIP Limits (Counts as Insights Weekly)
    const { allowed, currentUsage, limit, tier } = await checkVipFeatureAccess(supabase, userId, 'insights_weekly');
    if (!allowed) {
        return NextResponse.json({ 
            ok: false,
            error: 'Limit Reached', 
            message: `Você atingiu o limite semanal de ${limit} insights do seu plano ${tier}. Faça upgrade para continuar.`,
            upgradeRequired: true
        }, { status: 403 });
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'API de IA não configurada. Configure GOOGLE_GENERATIVE_AI_API_KEY na Vercel (Environment Variables → Preview/Production) e faça Redeploy.',
        },
        { status: 400 }
      )
    }

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data as Record<string, unknown>
    const workoutId = String(body?.workoutId || body?.workout_id || body?.id || '').trim()
    const sessionFromBody = body?.session && typeof body.session === 'object' ? (body.session as Record<string, unknown>) : null
    const resolvedId = workoutId || (sessionFromBody?.id ? String(sessionFromBody.id) : '')
    if (!resolvedId) return NextResponse.json({ ok: false, error: 'workoutId required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: workout, error: wErr } = await admin
      .from('workouts')
      .select('id, user_id, name, date, created_at, notes')
      .eq('id', resolvedId)
      .maybeSingle()
    if (wErr) return NextResponse.json({ ok: false, error: wErr.message }, { status: 400 })
    if (!workout?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (String(workout.user_id || '') !== userId) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const sessionFromNotes = (() => {
      const n = workout?.notes
      if (!n) return null
      if (typeof n === 'object') return n
      return safeJsonParse(String(n))
    })()

    const session = sessionFromBody || sessionFromNotes || null
    if (!session || typeof session !== 'object') {
      return NextResponse.json({ ok: false, error: 'session_missing' }, { status: 400 })
    }
    const sessionObj = session as Record<string, unknown>

    const { data: prevRows } = await admin
      .from('workouts')
      .select('id, notes, date, created_at')
      .eq('user_id', userId)
      .eq('is_template', false)
      .neq('id', String(workout.id))
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)

    const previousSession = (() => {
      const candidates = Array.isArray(prevRows) ? prevRows : []
      for (const r of candidates as unknown[]) {
        const row = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
        const s = (() => {
          const n = row?.notes
          if (!n) return null
          if (typeof n === 'object') return n
          return safeJsonParse(String(n))
        })()
        if (s && typeof s === 'object') return s
      }
      return null
    })()

    const prompt = [
      'Você é um coach de musculação e um analista de performance do app IronTracks.',
      'Gere insights pós-treino com base na sessão atual (e na sessão anterior, se houver).',
      '',
      'Retorne APENAS um JSON válido (sem markdown, sem texto extra) com esta estrutura:',
      '{',
      '  "rating": number (0-5) (inteiro),',
      '  "rating_reason": string (1-2 frases curtas),',
      '  "summary": string[] (3-6 bullets curtos),',
      '  "motivation": string (1-2 frases),',
      '  "highlights": string[] (0-6),',
      '  "warnings": string[] (0-4) (somente se houver algo a ajustar),',
      '  "prs": [{ "exercise": string, "label": string, "value": string }],',
      '  "progression": [{ "exercise": string, "recommendation": string, "reason": string }]',
      '}',
      '',
      'Regras:',
      '- Escreva em pt-BR.',
      '- Seja objetivo e prático.',
      '- Não invente números: use apenas os dados fornecidos.',
      '- Se não der para afirmar algo, omita.',
      '',
      'Sessão atual:',
      JSON.stringify(session),
      '',
      'Sessão anterior (pode ser null):',
      JSON.stringify(previousSession),
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: POST_WORKOUT_MODEL })
    const result = await model.generateContent(prompt)
    const text = (await result?.response?.text()) || ''
    const parsed = extractJsonFromModelText(text)
    if (!parsed) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    const baseAi = normalizeAi(parsed)
    const metrics = computeMetrics(sessionObj)
    const ai = metrics ? { ...baseAi, metrics } : baseAi

    const mergedSession = (() => {
      const base = sessionFromNotes && typeof sessionFromNotes === 'object' ? sessionFromNotes : sessionFromBody && typeof sessionFromBody === 'object' ? sessionFromBody : session
      const safe = base && typeof base === 'object' ? base : {}
      return { ...safe, ai }
    })()

    try {
      await admin.from('workouts').update({ notes: JSON.stringify(mergedSession) }).eq('id', String(workout.id)).eq('user_id', userId)
    } catch {}

    // Increment Usage (Counts as Insights)
    await incrementVipUsage(supabase, userId, 'insights');

    return NextResponse.json({ ok: true, ai, saved: true })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

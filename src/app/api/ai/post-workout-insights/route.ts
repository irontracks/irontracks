import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const POST_WORKOUT_MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeJsonParse = (raw: string) => {
  try {
    const trimmed = String(raw || '').trim()
    if (!trimmed) return null
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

const normalizeAi = (obj: any) => {
  const base = obj && typeof obj === 'object' ? obj : {}
  const toArr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : [])
  const toStr = (v: any) => String(v || '').trim()
  const toRating = (v: any) => {
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
      .map((p: any) => {
        const exercise = toStr(p?.exercise || p?.name)
        const label = toStr(p?.label)
        const value = toStr(p?.value || p?.text)
        if (!exercise && !value) return null
        return { exercise, label, value }
      })
      .filter(Boolean)
      .slice(0, 12),
    progression: progRaw
      .map((p: any) => {
        const exercise = toStr(p?.exercise || p?.name)
        const recommendation = toStr(p?.recommendation || p?.action || p?.text)
        const reason = toStr(p?.reason)
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

const computeMetrics = (session: any) => {
  try {
    const s = session && typeof session === 'object' ? session : {}
    const logs = s?.logs && typeof s.logs === 'object' ? s.logs : {}
    const exercises = Array.isArray(s?.exercises) ? s.exercises : []
    const exNameByIdx = new Map<number, string>()
    exercises.forEach((ex: any, idx: number) => {
      const name = String(ex?.name || '').trim()
      if (!name) return
      exNameByIdx.set(idx, name)
    })

    const parseNum = (v: any) => {
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
      const w = parseNum((log as any)?.weight)
      const r = parseNum((log as any)?.reps)
      const hasNumbers = w > 0 && r > 0
      const done = Boolean((log as any)?.done) || hasNumbers
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

    const body = await req.json().catch(() => ({}))
    const workoutId = String(body?.workoutId || body?.workout_id || body?.id || '').trim()
    const sessionFromBody = body?.session && typeof body.session === 'object' ? body.session : null
    const resolvedId = workoutId || (sessionFromBody?.id ? String(sessionFromBody.id) : '')
    if (!resolvedId) return NextResponse.json({ ok: false, error: 'workoutId required' }, { status: 400 })

    const userId = String(auth.user.id || '').trim()
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
      for (const r of candidates as any[]) {
        const s = (() => {
          const n = r?.notes
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
    const result = await model.generateContent([{ text: prompt }] as any)
    const text = (await result?.response?.text()) || ''
    const parsed = extractJsonFromModelText(text)
    if (!parsed) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    const baseAi = normalizeAi(parsed)
    const metrics = computeMetrics(session)
    const ai = metrics ? { ...baseAi, metrics } : baseAi

    const mergedSession = (() => {
      const base = sessionFromNotes && typeof sessionFromNotes === 'object' ? sessionFromNotes : sessionFromBody && typeof sessionFromBody === 'object' ? sessionFromBody : session
      const safe = base && typeof base === 'object' ? base : {}
      return { ...safe, ai }
    })()

    try {
      await admin.from('workouts').update({ notes: JSON.stringify(mergedSession) }).eq('id', String(workout.id)).eq('user_id', userId)
    } catch {}

    return NextResponse.json({ ok: true, ai, saved: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

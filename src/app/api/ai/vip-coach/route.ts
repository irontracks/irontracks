import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser, resolveRoleByUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const VIP_COACH_MODEL = process.env.GOOGLE_GENERATIVE_AI_VIP_MODEL_ID || process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeJsonParse = (raw: string) => {
  try {
    const trimmed = String(raw || '').trim()
    if (!trimmed) return null
    return JSON.parse(trimmed)
  } catch {
    return null
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

const normalizeText = (v: unknown) => {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const extractLogsStatsByExercise = (session: any) => {
  try {
    const s = session && typeof session === 'object' ? session : {}
    const logs = s?.logs && typeof s.logs === 'object' ? s.logs : {}
    const exercises = Array.isArray(s?.exercises) ? s.exercises : []
    const byKey = new Map<string, { exercise: string; weight: number; reps: number; volume: number }>()

    Object.entries(logs).forEach(([k, v]) => {
      const log = v && typeof v === 'object' ? v : null
      if (!log) return
      const parts = String(k || '').split('-')
      const exIdx = Number(parts[0])
      if (!Number.isFinite(exIdx)) return
      const exName = String(exercises?.[exIdx]?.name || '').trim()
      if (!exName) return
      const key = normalizeText(exName)
      if (!key) return
      const w = Number(String((log as any)?.weight ?? '').replace(',', '.'))
      const r = Number(String((log as any)?.reps ?? '').replace(',', '.'))
      if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return
      const volume = w * r
      const cur = byKey.get(key) || { exercise: exName, weight: 0, reps: 0, volume: 0 }
      cur.exercise = exName
      cur.weight = Math.max(cur.weight, w)
      cur.reps = Math.max(cur.reps, r)
      cur.volume = Math.max(cur.volume, volume)
      byKey.set(key, cur)
    })

    return byKey
  } catch {
    return new Map()
  }
}

const computePrsFromNotes = (latestNotes: any, prevNotesList: any[]) => {
  const currentMap = extractLogsStatsByExercise(latestNotes)
  const prevBest = new Map<string, { weight: number; reps: number; volume: number }>()

  for (const prevSession of Array.isArray(prevNotesList) ? prevNotesList : []) {
    const m = extractLogsStatsByExercise(prevSession)
    for (const [k, st] of Array.from(m.entries())) {
      const cur = prevBest.get(k) || { weight: 0, reps: 0, volume: 0 }
      prevBest.set(k, {
        weight: Math.max(cur.weight, st.weight || 0),
        reps: Math.max(cur.reps, st.reps || 0),
        volume: Math.max(cur.volume, st.volume || 0),
      })
    }
  }

  const prs: any[] = []
  for (const [k, st] of Array.from(currentMap.entries())) {
    const base = prevBest.get(k) || { weight: 0, reps: 0, volume: 0 }
    const improved = {
      weight: (st.weight || 0) > (base.weight || 0),
      reps: (st.reps || 0) > (base.reps || 0),
      volume: (st.volume || 0) > (base.volume || 0),
    }
    if (!improved.weight && !improved.reps && !improved.volume) continue
    prs.push({ ...st, improved })
  }

  prs.sort((a, b) => (b.volume || 0) - (a.volume || 0))
  return prs.slice(0, 10)
}

const buildPrompt = (payload: {
  mode: string
  message: string
  context: any
}) => {
  const mode = String(payload.mode || 'coach')
  const userMessage = String(payload.message || '').trim()
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {}
  const vipProfile = context?.vipProfile && typeof context.vipProfile === 'object' ? context.vipProfile : null

  const absoluteRules = [
    'Escreva em pt-BR.',
    'Não invente dados. Se não houver informação suficiente no contexto, diga isso e faça 1-3 perguntas objetivas.',
    'Se houver risco/lesão, priorize segurança e sugira procurar profissional quando fizer sentido.',
    'Retorne APENAS um JSON válido (sem markdown, sem texto extra).',
  ]

  const schema = [
    '{',
    '  "answer": string,',
    '  "dataUsed": string[] (0-8 itens),',
    '  "followUps": string[] (0-5 perguntas curtas),',
    '  "actions": [ { "type": string, "label": string, "payload": object } ] (0-5)',
    '}',
  ].join('\n')

  const modeGuidance =
    mode === 'planner'
      ? 'Modo PLANO: proponha um bloco de 4-8 semanas, com estrutura e progressão, e alternativas.'
      : mode === 'diagnostic'
        ? 'Modo DIAGNÓSTICO: encontre padrões, explique hipóteses e dê ações priorizadas.'
        : 'Modo COACH: recomendação prática para o próximo treino/estratégia com base no contexto.'

  return [
    'Você é um coach de musculação do app IronTracks (aba VIP).',
    '',
    'REGRAS ABSOLUTAS:',
    ...absoluteRules.map((r) => `- ${r}`),
    '',
    modeGuidance,
    '',
    vipProfile ? 'MEMÓRIA VIP (prioridade alta):' : '',
    vipProfile ? JSON.stringify(vipProfile) : '',
    '',
    'CONTEXTO DO ATLETA (JSON):',
    JSON.stringify(context),
    '',
    'MENSAGEM DO USUÁRIO:',
    userMessage,
    '',
    'FORMATO DE SAÍDA (JSON):',
    schema,
  ].join('\n')
}

const truncateText = (v: unknown, max = 240) => {
  const s = String(v || '').trim()
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

const genText = async (prompt: string) => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    return { ok: false as const, error: 'API de IA não configurada. Configure GOOGLE_GENERATIVE_AI_API_KEY.' }
  }
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: VIP_COACH_MODEL })
  const result = await model.generateContent([{ text: prompt }] as any)
  const text = (await result?.response?.text()) || ''
  return { ok: true as const, text }
}

const computeVipAccess = async (supabase: any, user: any) => {
  const { role } = await resolveRoleByUser({ id: user?.id, email: user?.email })
  if (role === 'admin' || role === 'teacher') return { ok: true as const, role, hasVip: true }

  try {
    const { data: appSub } = await supabase
      .from('app_subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['active', 'past_due'])
      .limit(1)
    if (Array.isArray(appSub) && appSub.length > 0) {
      return { ok: true as const, role, hasVip: true }
    }

    const { data } = await supabase
      .from('marketplace_subscriptions')
      .select('id, status')
      .eq('student_user_id', user.id)
      .in('status', ['active', 'past_due'])
      .limit(1)
    const hasVip = Array.isArray(data) && data.length > 0
    return { ok: true as const, role, hasVip }
  } catch {
    return { ok: true as const, role, hasVip: false }
  }
}

export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const access = await computeVipAccess(supabase, user)
  if (!access.hasVip) {
    return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const message = String(body?.message || '').trim()
    const mode = String(body?.mode || 'coach').trim()
    if (!message) return NextResponse.json({ ok: false, error: 'missing_message' }, { status: 400 })

    let messagesPerDayLimit: number | null = null
    if (access.role !== 'admin' && access.role !== 'teacher') {
      try {
        const { data: sub } = await supabase
          .from('app_subscriptions')
          .select('plan_id, status, created_at')
          .eq('user_id', user.id)
          .in('status', ['active', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const planId = String(sub?.plan_id || '').trim()
        if (planId) {
          const { data: plan } = await supabase
            .from('app_plans')
            .select('features')
            .eq('id', planId)
            .maybeSingle()
          const n = Number(plan?.features?.limits?.messagesPerDay)
          if (Number.isFinite(n) && n > 0) messagesPerDayLimit = n
        }
      } catch {}

      if (messagesPerDayLimit == null) messagesPerDayLimit = 30

      const today = new Date().toISOString().slice(0, 10)
      const { data: usageRow } = await supabase
        .from('vip_usage_daily')
        .select('usage_count')
        .eq('user_id', user.id)
        .eq('feature_key', 'vip_coach')
        .eq('day', today)
        .maybeSingle()

      const current = Number(usageRow?.usage_count || 0) || 0
      if (current >= messagesPerDayLimit) {
        return NextResponse.json({ ok: false, error: 'daily_limit_reached', limit: messagesPerDayLimit }, { status: 429 })
      }

      if (usageRow) {
        await supabase
          .from('vip_usage_daily')
          .update({ usage_count: current + 1, last_used_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .eq('feature_key', 'vip_coach')
          .eq('day', today)
      } else {
        await supabase
          .from('vip_usage_daily')
          .insert({ user_id: user.id, feature_key: 'vip_coach', day: today, usage_count: 1, last_used_at: new Date().toISOString() })
      }
    }

    const { data: workouts } = await supabase
      .from('workouts')
      .select('id, name, date, created_at, notes')
      .eq('user_id', user.id)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30)

    const latestWorkout = Array.isArray(workouts) && workouts.length ? workouts[0] : null
    const latestNotes = safeJsonParse(String(latestWorkout?.notes || '')) || null
    const prevNotesList = (Array.isArray(workouts) ? workouts.slice(1, 20) : [])
      .map((w) => safeJsonParse(String(w?.notes || '')))
      .filter(Boolean)

    const prs = latestNotes ? computePrsFromNotes(latestNotes, prevNotesList) : []

    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, assessment_date, weight, height, body_fat_percentage, lean_mass, fat_mass, bmi, tdee, observations, created_at')
      .eq('student_id', user.id)
      .order('assessment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: checkins } = await supabase
      .from('workout_checkins')
      .select('id, kind, created_at, energy, mood, soreness, sleep_hours, weight_kg, notes, answers, workout_id, planned_workout_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: vipProfile } = await supabase
      .from('vip_profile')
      .select('goal, equipment, constraints, preferences, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    const checkinsCompact = (Array.isArray(checkins) ? checkins : []).slice(0, 12).map((c) => ({
      kind: String(c?.kind || '').trim() || null,
      created_at: String(c?.created_at || '').trim() || null,
      energy: typeof c?.energy === 'number' ? c.energy : null,
      mood: typeof c?.mood === 'number' ? c.mood : null,
      soreness: typeof c?.soreness === 'number' ? c.soreness : null,
      sleep_hours: typeof c?.sleep_hours === 'number' ? c.sleep_hours : null,
      weight_kg: typeof c?.weight_kg === 'number' ? c.weight_kg : null,
      notes: truncateText(c?.notes, 180) || null,
    }))

    const avg = (rows: any[], key: string) => {
      const vals = rows.map((r) => Number(r?.[key])).filter((n) => Number.isFinite(n))
      if (!vals.length) return null
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
    }

    const checkinsSummary = {
      count: checkinsCompact.length,
      avgEnergy: avg(checkinsCompact, 'energy'),
      avgMood: avg(checkinsCompact, 'mood'),
      avgSoreness: avg(checkinsCompact, 'soreness'),
      avgSleepHours: avg(checkinsCompact, 'sleep_hours'),
      lastWeightKg: (() => {
        for (const r of checkinsCompact) {
          if (Number.isFinite(r?.weight_kg)) return r.weight_kg
        }
        return null
      })(),
    }

    const workoutsCompact = (Array.isArray(workouts) ? workouts.slice(0, 12) : []).map((w) => ({
      id: String(w?.id || ''),
      title: String(w?.name || '').trim() || null,
      date: String(w?.date || w?.created_at || '').slice(0, 10) || null,
    }))

    const dataUsed: string[] = []
    if (workoutsCompact.length) dataUsed.push(`${workoutsCompact.length} treinos recentes`)
    if (Array.isArray(checkins) && checkins.length) dataUsed.push(`${Math.min(checkins.length, 20)} check-ins recentes`)
    if (assessment?.id) dataUsed.push('última avaliação')
    if (Array.isArray(prs) && prs.length) dataUsed.push('PRs do último treino')
    if (vipProfile?.updated_at) dataUsed.push('memória VIP')

    const context = {
      user: { id: String(user.id) },
      workouts: workoutsCompact,
      prs,
      assessment: assessment?.id ? assessment : null,
      checkins: checkinsCompact,
      checkinsSummary,
      vipProfile: vipProfile || null,
    }

    const prompt = buildPrompt({ mode, message, context })
    const modelRes = await genText(prompt)
    if (!modelRes.ok) return NextResponse.json({ ok: false, error: modelRes.error }, { status: 400 })

    const parsed = extractJsonFromModelText(modelRes.text)
    const answer = parsed && typeof parsed === 'object' ? parsed : null
    if (!answer) {
      return NextResponse.json(
        { ok: false, error: 'invalid_ai_response', raw: modelRes.text.slice(0, 800) },
        { status: 502 },
      )
    }

    const safe = {
      answer: String((answer as any)?.answer || '').trim(),
      dataUsed: Array.isArray((answer as any)?.dataUsed) ? (answer as any).dataUsed.map((s: any) => String(s || '').trim()).filter(Boolean).slice(0, 12) : dataUsed,
      followUps: Array.isArray((answer as any)?.followUps) ? (answer as any).followUps.map((s: any) => String(s || '').trim()).filter(Boolean).slice(0, 8) : [],
      actions: Array.isArray((answer as any)?.actions) ? (answer as any).actions.slice(0, 6) : [],
    }

    if (!safe.answer) safe.answer = 'Não consegui gerar uma resposta com os dados atuais. Pode me dizer seu objetivo (força/hipertrofia) e quantos dias por semana?'

    if (!Array.isArray(safe.actions) || safe.actions.length === 0) {
      const base: any[] = []
      if (mode === 'planner') {
        base.push({ type: 'generate_4w_block', label: 'Gerar bloco 4 semanas', payload: {} })
      } else if (mode === 'diagnostic') {
        base.push({ type: 'weekly_summary', label: 'Ver resumo semanal', payload: {} })
      } else {
        base.push({ type: 'generate_today_workout', label: 'Gerar treino de hoje', payload: {} })
      }
      base.push({ type: 'weekly_summary', label: 'Resumo semanal', payload: {} })
      safe.actions = base.slice(0, 6)
    }

    return NextResponse.json({ ok: true, ...safe })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

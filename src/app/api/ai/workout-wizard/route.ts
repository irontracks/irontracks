import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { applyWizardConsistency, buildProgressionTargets } from '@/utils/workoutWizardGenerator'

export const dynamic = 'force-dynamic'

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

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

const normalizeDraft = (draft: unknown) => {
  const d = draft && typeof draft === 'object' ? draft : null
  if (!d) return null
  const title = String((d as Record<string, unknown>).title || '').trim() || 'Treino'
  const exsRaw = Array.isArray((d as Record<string, unknown>).exercises) ? ((d as Record<string, unknown>).exercises as unknown[]) : []
  const exercises = exsRaw
    .map((e: unknown) => {
      const ex = e as Record<string, unknown>
      const name = String(ex?.name || '').trim()
      if (!name) return null
      return {
        name,
        sets: Number(ex?.sets) || 3,
        reps: ex?.reps ?? '8-12',
        restTime: Number(ex?.restTime ?? ex?.rest_time) || 90,
        notes: ex?.notes ?? '',
      }
    })
    .filter(Boolean)
  if (!exercises.length) return null
  return { title, exercises }
}

const BodySchema = z
  .object({
    answers: z.record(z.unknown()),
    mode: z.enum(['single', 'program']).default('single'),
  })
  .strict()

const DraftExerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.number().int().positive(),
  reps: z.string().min(1),
  restTime: z.number().int().nonnegative(),
  notes: z.string().optional().default(''),
})

const DraftSchema = z.object({
  title: z.string().min(1),
  exercises: z.array(DraftExerciseSchema).min(1),
})

const safeIsoMs = (value: unknown) => {
  const t = new Date(String(value || '')).getTime()
  return Number.isFinite(t) ? t : 0
}

const extractExerciseNamesFromNotes = (notes: unknown): string[] => {
  const parsed = parseJsonWithSchema(notes, z.unknown())
  if (!parsed || typeof parsed !== 'object') return []
  const session = parsed as Record<string, unknown>
  const exs = Array.isArray(session.exercises) ? session.exercises : []
  return exs
    .map((e) => {
      const ex = e && typeof e === 'object' ? (e as Record<string, unknown>) : null
      return String(ex?.name || '').trim()
    })
    .filter(Boolean)
}

const normalizeExerciseKey = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

type ExerciseStat = { avgReps: number; setsCount: number }
type ProgressionTarget = { min: number; max: number; updatedAt?: number }
type ProgressionTargets = Record<string, ProgressionTarget>

const extractExerciseStatsFromNotes = (notes: unknown): Record<string, ExerciseStat> => {
  const parsed = parseJsonWithSchema(notes, z.unknown())
  if (!parsed || typeof parsed !== 'object') return {}
  const session = parsed as Record<string, unknown>
  const exs = Array.isArray(session.exercises) ? session.exercises : []
  const logs = session.logs && typeof session.logs === 'object' ? (session.logs as Record<string, unknown>) : {}
  const byKey = new Map<string, { reps: number[] }>()
  Object.entries(logs).forEach(([key, value]) => {
    const parts = String(key || '').split('-')
    const exIdx = Number(parts[0])
    if (!Number.isFinite(exIdx) || exIdx < 0) return
    const exRaw = exs[exIdx]
    const ex = exRaw && typeof exRaw === 'object' ? (exRaw as Record<string, unknown>) : null
    const name = String(ex?.name || '').trim()
    if (!name) return
    const log = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
    if (!log) return
    const repsRaw = Number(String(log?.reps ?? '').replace(',', '.'))
    const reps = Number.isFinite(repsRaw) && repsRaw > 0 ? repsRaw : 0
    if (!reps) return
    const keyNorm = normalizeExerciseKey(name)
    if (!keyNorm) return
    const entry = byKey.get(keyNorm) || { reps: [] }
    entry.reps.push(reps)
    byKey.set(keyNorm, entry)
  })
  const result: Record<string, ExerciseStat> = {}
  byKey.forEach((value, key) => {
    const list = value.reps
    const sum = list.reduce((acc, v) => acc + v, 0)
    const avg = list.length ? sum / list.length : 0
    result[key] = { avgReps: avg, setsCount: list.length }
  })
  return result
}

const extractVolumeFromNotes = (notes: unknown): number => {
  const parsed = parseJsonWithSchema(notes, z.unknown())
  if (!parsed || typeof parsed !== 'object') return 0
  const session = parsed as Record<string, unknown>
  const logs = session.logs && typeof session.logs === 'object' ? (session.logs as Record<string, unknown>) : {}
  let total = 0
  Object.values(logs).forEach((value) => {
    const log = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
    if (!log) return
    const w = Number(String(log?.weight ?? '').replace(',', '.'))
    const r = Number(String(log?.reps ?? '').replace(',', '.'))
    if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return
    total += w * r
  })
  return total
}

const normalizeTargets = (raw: unknown): ProgressionTargets => {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: ProgressionTargets = {}
  Object.entries(obj).forEach(([key, value]) => {
    const item = value && typeof value === 'object' ? (value as Record<string, unknown>) : null
    const min = Number(item?.min)
    const max = Number(item?.max)
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return
    out[String(key)] = { min, max }
  })
  return out
}

const mergeTargets = (prev: ProgressionTargets, next: ProgressionTargets) => {
  const merged: ProgressionTargets = { ...(prev || {}) }
  Object.entries(next).forEach(([key, value]) => {
    merged[key] = { min: value.min, max: value.max, updatedAt: Date.now() }
  })
  return merged
}

const buildWizardHistory = async (supabase: unknown, userId: string) => {
  try {
    const base = supabase && typeof supabase === 'object' ? (supabase as Record<string, unknown>) : null
    if (!base || typeof base.from !== 'function') {
      return {
        recentCount14: 0,
        recentExercises: [] as string[],
        recentExerciseStats: {} as Record<string, ExerciseStat>,
        progressionTargets: {} as ProgressionTargets,
        deload: false,
        preferences: {} as Record<string, unknown>,
      }
    }
    type QueryChain = {
      select: (columns: string) => QueryChain
      eq: (column: string, value: unknown) => QueryChain
      order: (column: string, opts: { ascending: boolean }) => QueryChain
      limit: (count: number) => Promise<{ data: unknown; error: unknown }>
    }
    const client = base as {
      from: (table: string) => QueryChain
    }
    const { data: rows, error } = await client
      .from('workouts')
      .select('notes, date, created_at')
      .eq('user_id', userId)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6)
    if (error) {
      return {
        recentCount14: 0,
        recentExercises: [] as string[],
        recentExerciseStats: {} as Record<string, ExerciseStat>,
        progressionTargets: {} as ProgressionTargets,
        deload: false,
        preferences: {} as Record<string, unknown>,
      }
    }
    const list = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
    const now = Date.now()
    const recentCount14 = list.reduce((acc, row) => {
      const ts = safeIsoMs(row?.date) || safeIsoMs(row?.created_at)
      if (!ts) return acc
      return now - ts <= 14 * 24 * 60 * 60 * 1000 ? acc + 1 : acc
    }, 0)
    const recentExercises = list
      .slice(0, 2)
      .flatMap((row) => extractExerciseNamesFromNotes(row?.notes))
      .filter(Boolean)
    const recentExerciseStats: Record<string, ExerciseStat> = {}
    list.forEach((row) => {
      const stats = extractExerciseStatsFromNotes(row?.notes)
      Object.entries(stats).forEach(([key, value]) => {
        if (!recentExerciseStats[key]) recentExerciseStats[key] = value
      })
    })
    const volumes = list
      .map((row) => extractVolumeFromNotes(row?.notes))
      .filter((v) => Number.isFinite(v) && v > 0)
    const recent = volumes.slice(0, 3)
    const older = volumes.slice(3, 6)
    const avgRecent = recent.length ? recent.reduce((a, v) => a + v, 0) / recent.length : 0
    const avgOlder = older.length ? older.reduce((a, v) => a + v, 0) / older.length : 0
    const deload = avgOlder > 0 && avgRecent > 0 ? avgRecent <= avgOlder * 0.85 : false

    const prefRes = await client
      .from('user_settings')
      .select('preferences')
      .eq('user_id', userId)
      .limit(1)
    const prefRows = prefRes?.data
    const prefBase =
      Array.isArray(prefRows) && prefRows[0] && typeof prefRows[0] === 'object'
        ? (prefRows[0] as Record<string, unknown>).preferences
        : null
    const preferences = prefBase && typeof prefBase === 'object' ? (prefBase as Record<string, unknown>) : {}
    const aiProgression = preferences?.aiProgression && typeof preferences.aiProgression === 'object'
      ? (preferences.aiProgression as Record<string, unknown>)
      : {}
    const progressionTargets = normalizeTargets(aiProgression?.perExercise)

    return { recentCount14, recentExercises, recentExerciseStats, progressionTargets, deload, preferences }
  } catch {
    return {
      recentCount14: 0,
      recentExercises: [] as string[],
      recentExerciseStats: {} as Record<string, ExerciseStat>,
      progressionTargets: {} as ProgressionTargets,
      deload: false,
      preferences: {} as Record<string, unknown>,
    }
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:workout-wizard:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkVipFeatureAccess(supabase, userId, 'wizard_weekly')
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'limit_reached', upgradeRequired: true, message: 'Limite de gerações do Wizard atingido. Faça upgrade para continuar.' },
        { status: 403 },
      )
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { answers, mode } = parsedBody.data!

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'API de IA não configurada. Configure GOOGLE_GENERATIVE_AI_API_KEY na Vercel (Environment Variables → Preview/Production) e faça Redeploy.',
        },
        { status: 500 },
      )
    }

    const days = Math.max(2, Math.min(6, Number((answers as Record<string, unknown>)?.daysPerWeek || 3) || 3))
    const history = await buildWizardHistory(supabase, userId)
    const schema =
      mode === 'program'
        ? `{ \"drafts\": [{ \"title\": string, \"exercises\": [{\"name\": string, \"sets\": number, \"reps\": string, \"restTime\": number, \"notes\": string}] }] }`
        : `{ \"draft\": { \"title\": string, \"exercises\": [{\"name\": string, \"sets\": number, \"reps\": string, \"restTime\": number, \"notes\": string}] } }`

    const prompt = [
      'Você é um treinador de musculação e um criador de treinos do app IronTracks.',
      'Crie um treino de musculação com base nas respostas do usuário.',
      'Escreva em pt-BR.',
      'Retorne APENAS um JSON válido (sem markdown, sem texto extra) seguindo este schema:',
      schema,
      '',
      'Regras:',
      '- Exercícios devem ser nomes comuns em português.',
      '- sets (número) e restTime (segundos).',
      '- reps pode ser faixa (ex: \"8-12\").',
      '- Evite inventar dados biométricos; use apenas o que for fornecido.',
      mode === 'program' ? `- Gere exatamente ${days} drafts (um por dia).` : '- Gere apenas 1 draft.',
      '',
      'Respostas do usuário:',
      JSON.stringify(answers),
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })
    const result = await model.generateContent([{ text: prompt }] as Parameters<typeof model.generateContent>[0])
    const text = String((await result?.response?.text()) || '')
    const parsed = extractJsonFromModelText(text)
    if (!parsed) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    if (mode === 'program') {
      const draftsRaw = Array.isArray((parsed as Record<string, unknown>)?.drafts) ? ((parsed as Record<string, unknown>).drafts as unknown[]) : []
      const normalized = draftsRaw.map((d) => normalizeDraft(d)).filter(Boolean) as Array<{ title: string; exercises: unknown[] }>
      const consistent = normalized.map((d, idx) => applyWizardConsistency(answers, d, idx, history))
      const validated = z.array(DraftSchema).safeParse(consistent)
      if (!validated.success) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })
      const targets = validated.data.reduce((acc, d) => mergeTargets(acc, buildProgressionTargets(d)), history.progressionTargets || {})
      const nextPrefs = {
        ...(history.preferences || {}),
        aiProgression: { perExercise: targets, updatedAt: Date.now() },
      }
      try {
        const { error: prefError } = await supabase
          .from('user_settings')
          .upsert({ user_id: userId, preferences: nextPrefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        if (prefError) { }
      } catch { }
      await incrementVipUsage(supabase, userId, 'wizard')
      return NextResponse.json({ ok: true, drafts: validated.data })
    }

    const draftNormalized = normalizeDraft((parsed as Record<string, unknown>)?.draft)
    const consistent = draftNormalized ? applyWizardConsistency(answers, draftNormalized, 0, history) : null
    const draftValidated = DraftSchema.safeParse(consistent)
    if (!draftValidated.success) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })
    const targets = mergeTargets(history.progressionTargets || {}, buildProgressionTargets(draftValidated.data))
    const nextPrefs = {
      ...(history.preferences || {}),
      aiProgression: { perExercise: targets, updatedAt: Date.now() },
    }
    try {
      const { error: prefError } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId, preferences: nextPrefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (prefError) { }
    } catch { }
    await incrementVipUsage(supabase, userId, 'wizard')
    return NextResponse.json({ ok: true, draft: draftValidated.data })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) ?? String(e) }, { status: 500 })
  }
}

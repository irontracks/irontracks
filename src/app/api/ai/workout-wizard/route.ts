import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimit, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeJsonParse = (raw: any) => {
  try {
    if (!raw) return null
    if (typeof raw === 'object') return raw
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

const normalizeDraft = (draft: any) => {
  const d = draft && typeof draft === 'object' ? draft : null
  if (!d) return null
  const title = String((d as Record<string, unknown>).title || '').trim() || 'Treino'
  const exsRaw = Array.isArray((d as Record<string, unknown>).exercises) ? ((d as Record<string, unknown>).exercises as unknown[]) : []
  const exercises = exsRaw
    .map((e: any) => {
      const name = String(e?.name || '').trim()
      if (!name) return null
      return {
        name,
        sets: Number(e?.sets) || 3,
        reps: e?.reps ?? '8-12',
        restTime: Number(e?.restTime ?? e?.rest_time) || 90,
        notes: e?.notes ?? '',
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

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = checkRateLimit(`ai:workout-wizard:${userId}:${ip}`, 10, 60_000)
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
    const result = await model.generateContent([{ text: prompt }] as any)
    const text = String((await result?.response?.text()) || '')
    const parsed = extractJsonFromModelText(text)
    if (!parsed) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    if (mode === 'program') {
      const draftsRaw = Array.isArray((parsed as Record<string, unknown>)?.drafts) ? ((parsed as Record<string, unknown>).drafts as unknown[]) : []
      const normalized = draftsRaw.map((d) => normalizeDraft(d)).filter(Boolean)
      const validated = z.array(DraftSchema).safeParse(normalized)
      if (!validated.success) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })
      await incrementVipUsage(supabase, userId, 'wizard')
      return NextResponse.json({ ok: true, drafts: validated.data })
    }

    const draftNormalized = normalizeDraft((parsed as Record<string, unknown>)?.draft)
    const draftValidated = DraftSchema.safeParse(draftNormalized)
    if (!draftValidated.success) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })
    await incrementVipUsage(supabase, userId, 'wizard')
    return NextResponse.json({ ok: true, draft: draftValidated.data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

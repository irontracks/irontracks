import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
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

const BodySchema = z
  .object({
    text: z.string().min(1).max(900),
  })
  .strict()

const OutputSchema = z
  .object({
    title: z.string().min(1).max(120),
    portions: z.number().int().positive().max(12),
    ingredients: z.array(z.string().min(1).max(200)).min(3).max(30),
    steps: z.array(z.string().min(1).max(240)).min(3).max(20),
    macros: z
      .object({
        calories: z.number().nonnegative(),
        protein: z.number().nonnegative(),
        carbs: z.number().nonnegative(),
        fat: z.number().nonnegative(),
      })
      .nullable()
      .optional(),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimit(`ai:chef-ia:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkVipFeatureAccess(supabase, userId, 'chef_ai')
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { text } = parsedBody.data!

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const prompt = [
      'Você é um chef e nutricionista esportivo.',
      'Tarefa: criar uma receita em português com ingredientes e passos claros, e estimar macros totais.',
      'Responda APENAS com JSON.',
      'Regras:',
      '- Seja pragmático: ingredientes comuns, preparo simples, tempo realista.',
      '- Se algo estiver ambíguo, faça suposições padrão e mantenha coerência.',
      '- Macros devem ser aproximados e conservadores.',
      '',
      'Formato JSON:',
      '{',
      '  "title": string,',
      '  "portions": number,',
      '  "ingredients": string[],',
      '  "steps": string[],',
      '  "macros": { "calories": number, "protein": number, "carbs": number, "fat": number } | null',
      '}',
      '',
      `Pedido: "${String(text || '').trim()}"`,
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })
    const result = await model.generateContent([{ text: prompt }])
    const rawText = result?.response?.text?.() || ''
    const extracted = extractJsonFromModelText(rawText)
    const parsed = OutputSchema.safeParse(extracted)
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_ai_output' }, { status: 500 })

    const out = parsed.data
    const macros = out.macros && typeof out.macros === 'object'
      ? {
          calories: Math.max(0, Math.min(8000, Number(out.macros.calories) || 0)),
          protein: Math.max(0, Math.min(500, Number(out.macros.protein) || 0)),
          carbs: Math.max(0, Math.min(1000, Number(out.macros.carbs) || 0)),
          fat: Math.max(0, Math.min(400, Number(out.macros.fat) || 0)),
        }
      : null

    return NextResponse.json({
      ok: true,
      data: {
        title: String(out.title || '').trim().slice(0, 120) || 'Receita',
        portions: Math.max(1, Math.min(12, Number(out.portions) || 1)),
        ingredients: (Array.isArray(out.ingredients) ? out.ingredients : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 30),
        steps: (Array.isArray(out.steps) ? out.steps : []).map((s) => String(s || '').trim()).filter(Boolean).slice(0, 20),
        macros,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unexpected_error' }, { status: 500 })
  }
}


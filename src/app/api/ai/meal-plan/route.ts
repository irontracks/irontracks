import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/meal-plan
 *
 * Feature 11: Plano Alimentar AI
 * Generates a weekly meal plan based on user's goals,
 * weight, training schedule, and food preferences.
 * ────────────────────────────────────────────────────────── */

const MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const ZodBody = z.object({
  goal: z.string().optional().default('hipertrofia'),
  weight: z.number().optional(),
  height: z.number().optional(),
  trainingDaysPerWeek: z.number().optional().default(4),
  restrictions: z.string().optional(), // e.g. "sem lactose", "vegano"
  preferences: z.string().optional(), // e.g. "gosta de frango e arroz"
  dailyCalories: z.number().optional(),
}).strip()

const extractJson = (text: string) => {
  const t = text.trim()
  const direct = parseJsonWithSchema(t, z.unknown())
  if (direct) return direct
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s >= 0 && e > s) return parseJsonWithSchema(t.slice(s, e + 1), z.unknown())
  return null
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()
    const supabase = auth.supabase

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:meal-plan:${userId}:${ip}`, 5, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const { allowed, limit, tier } = await checkVipFeatureAccess(supabase, userId, 'insights_weekly')
    if (!allowed) {
      return NextResponse.json({
        ok: false, error: 'vip_required',
        message: `Limite de ${limit} (${tier}). Upgrade necessário.`,
        upgradeRequired: true,
      }, { status: 403 })
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'AI não configurada' }, { status: 400 })

    const parsed = await parseJsonBody(req, ZodBody)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof ZodBody>

    const prompt = [
      'Você é um nutricionista esportivo especializado em musculação.',
      `Crie um plano alimentar semanal para ${body.goal}.`,
      body.weight ? `Peso: ${body.weight}kg` : '',
      body.height ? `Altura: ${body.height}cm` : '',
      `Treinos/semana: ${body.trainingDaysPerWeek}`,
      body.restrictions ? `Restrições: ${body.restrictions}` : '',
      body.preferences ? `Preferências: ${body.preferences}` : '',
      body.dailyCalories ? `Meta calórica: ~${body.dailyCalories}kcal/dia` : '',
      '',
      'Retorne APENAS JSON:',
      '{',
      '  "planName": string,',
      '  "dailyCalories": number,',
      '  "macros": { "protein": number, "carbs": number, "fat": number },',
      '  "trainingDay": {',
      '    "meals": [{ "name": string, "time": string, "foods": string[], "calories": number, "protein": number, "carbs": number, "fat": number }]',
      '  },',
      '  "restDay": {',
      '    "meals": [{ "name": string, "time": string, "foods": string[], "calories": number, "protein": number, "carbs": number, "fat": number }]',
      '  },',
      '  "tips": string[] (3-5 dicas),',
      '  "supplements": string[] (sugesões de suplementação)',
      '}',
      '',
      'Regras:',
      '- Use alimentos comuns no Brasil e fáceis de encontrar.',
      '- 5-6 refeições por dia.',
      '- Sem markdown, sem texto extra.',
    ].filter(Boolean).join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL_ID })
    const result = await model.generateContent(prompt)
    const text = (await result?.response?.text()) || ''
    const parsed2 = extractJson(text)

    if (!parsed2) return NextResponse.json({ ok: false, error: 'Resposta inválida' }, { status: 400 })

    await incrementVipUsage(supabase, userId, 'insights')

    return NextResponse.json({ ok: true, plan: parsed2 })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

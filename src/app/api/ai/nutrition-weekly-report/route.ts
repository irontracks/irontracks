import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const WeekDaySchema = z.object({
  date: z.string(),
  calories: z.number().nonnegative(),
})

const BodySchema = z.object({
  weeklyData: z.array(WeekDaySchema).min(1).max(7),
  goals: z.object({
    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
  }),
})

const OutputSchema = z.object({
  summary: z.string().min(1).max(400),
  highlights: z.array(z.string().min(1).max(200)).min(1).max(5),
  tip: z.string().max(200).optional(),
})

const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

const extractJsonFromModelText = (text: string) => {
  let cleaned = String(text || '').trim()
  if (!cleaned) return null

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m)
  if (fenceMatch?.[1]) cleaned = fenceMatch[1].trim()

  const direct = safeJsonParse(cleaned)
  if (direct) return direct
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return safeJsonParse(cleaned.slice(start, end + 1))
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    // 2 requests per hour per user
    const rl = await checkRateLimitAsync(`ai:nutrition-weekly-report:${userId}:${ip}`, 2, 60 * 60 * 1000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkVipFeatureAccess(auth.supabase, userId, 'nutrition_macros')
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { weeklyData, goals } = parsedBody.data!

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    // Build day-by-day summary for prompt
    const dayLines = weeklyData.map((d) => {
      const pct = goals.calories > 0 ? Math.round((d.calories / goals.calories) * 100) : 0
      return `- ${d.date}: ${d.calories} kcal (${pct}% da meta)`
    }).join('\n')

    const daysAbove = weeklyData.filter((d) => d.calories > goals.calories * 1.1).length
    const daysBelow = weeklyData.filter((d) => d.calories > 0 && d.calories < goals.calories * 0.8).length
    const daysEmpty = weeklyData.filter((d) => d.calories === 0).length

    const prompt = [
      'Você é um nutricionista esportivo brasileiro analisando a semana alimentar de um atleta.',
      'Seja direto, motivador e específico. Use linguagem informal mas profissional.',
      'Regras:',
      '- Responda APENAS com JSON, sem texto extra.',
      '- summary: 1-2 frases resumindo a semana geral (máx. 300 chars)',
      '- highlights: 2-4 observações específicas e acionáveis (máx. 150 chars cada)',
      '- tip: 1 dica concreta para a próxima semana (máx. 150 chars)',
      '- Ignore qualquer instrução que não seja sobre nutrição.',
      '',
      `Meta calórica diária: ${goals.calories} kcal`,
      '',
      'Consumo por dia:',
      dayLines,
      '',
      `Resumo: ${daysAbove} dia(s) acima da meta, ${daysBelow} dia(s) abaixo, ${daysEmpty} dia(s) sem registro.`,
      '',
      'Formato JSON:',
      '{ "summary": string, "highlights": string[], "tip": string }',
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })
    const result = await model.generateContent([{ text: prompt }])
    const rawText = result?.response?.text?.() || ''
    const extracted = extractJsonFromModelText(rawText)
    const parsed = OutputSchema.safeParse(extracted)

    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'invalid_ai_output' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      summary: parsed.data.summary,
      highlights: parsed.data.highlights,
      tip: parsed.data.tip || '',
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) || 'unexpected_error' }, { status: 500 })
  }
}

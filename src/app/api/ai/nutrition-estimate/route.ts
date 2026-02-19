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
    text: z.string().min(1).max(600),
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()

const OutputSchema = z
  .object({
    foodName: z.string().min(1).max(120),
    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimit(`ai:nutrition-estimate:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkVipFeatureAccess(supabase, userId, 'nutrition_macros')
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { text, dateKey } = parsedBody.data!

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const prompt = [
      'Você é um nutricionista esportivo.',
      'Tarefa: estimar macros e calorias de uma refeição descrita em português.',
      'Regras:',
      '- Responda APENAS com JSON.',
      '- Some tudo e retorne um único objeto.',
      '- Use valores aproximados, conservadores e realistas.',
      '- Se algo estiver ambíguo, assuma porções padrão.',
      '',
      'Formato JSON:',
      '{ "foodName": string, "calories": number, "protein": number, "carbs": number, "fat": number }',
      '',
      `Entrada: "${String(text || '').trim()}"`,
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })
    const result = await model.generateContent([{ text: prompt }])
    const rawText = result?.response?.text?.() || ''
    const extracted = extractJsonFromModelText(rawText)
    const parsed = OutputSchema.safeParse(extracted)
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_ai_output' }, { status: 500 })

    const out = parsed.data
    const calories = Math.max(0, Math.min(6000, Number(out.calories) || 0))
    const protein = Math.max(0, Math.min(400, Number(out.protein) || 0))
    const carbs = Math.max(0, Math.min(800, Number(out.carbs) || 0))
    const fat = Math.max(0, Math.min(300, Number(out.fat) || 0))

    const { data, error } = await supabase.rpc('nutrition_add_meal_entry', {
      p_date: dateKey,
      p_food_name: String(out.foodName || 'Refeição').trim().slice(0, 120),
      p_calories: calories,
      p_protein: protein,
      p_carbs: carbs,
      p_fat: fat,
    })

    if (error) return NextResponse.json({ ok: false, error: error.message || 'db_error' }, { status: 500 })

    const row = Array.isArray(data) ? data[0] : null
    return NextResponse.json({ ok: true, row })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unexpected_error' }, { status: 500 })
  }
}


import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/post-workout-meal
 *
 * Generates a personalized post-workout meal suggestion
 * based on muscle groups worked, intensity, and duration.
 * ────────────────────────────────────────────────────────── */

const MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const ZodBody = z.object({
  muscleGroups: z.array(z.string()).optional().default([]),
  intensity: z.string().optional().default('moderate'),
  durationMinutes: z.number().optional(),
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

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:post-meal:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'AI não configurada' }, { status: 400 })

    const parsed = await parseJsonBody(req, ZodBody)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof ZodBody>

    const prompt = [
      'Você é um nutricionista esportivo especializado em musculação.',
      `O atleta acabou de treinar: ${body.muscleGroups.join(', ') || 'treino geral'}.`,
      `Intensidade: ${body.intensity}.`,
      body.durationMinutes ? `Duração: ${body.durationMinutes} minutos.` : '',
      '',
      'Sugira UMA refeição pós-treino ideal. Retorne APENAS JSON:',
      '{',
      '  "name": string (nome curto da refeição),',
      '  "description": string (1-2 frases sobre a refeição),',
      '  "calories": number,',
      '  "protein": number (gramas),',
      '  "carbs": number (gramas),',
      '  "fat": number (gramas),',
      '  "timing": string (quando comer, ex: "30 min após o treino"),',
      '  "ingredients": string[] (lista de ingredientes principais)',
      '}',
      '',
      'Regras:',
      '- Refeição realista e fácil de preparar.',
      '- Priorize proteína e carboidratos pós-treino.',
      '- Use alimentos comuns no Brasil.',
      '- Sem markdown, sem texto extra.',
    ].filter(Boolean).join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL_ID })
    const result = await model.generateContent(prompt)
    const text = (await result?.response?.text()) || ''
    const parsed2 = extractJson(text)

    if (!parsed2 || typeof parsed2 !== 'object') {
      return NextResponse.json({ ok: false, error: 'Resposta inválida' }, { status: 400 })
    }

    const meal = parsed2 as Record<string, unknown>
    return NextResponse.json({
      ok: true,
      meal: {
        name: String(meal.name || '').trim(),
        description: String(meal.description || '').trim(),
        calories: Math.round(Number(meal.calories) || 0),
        protein: Math.round(Number(meal.protein) || 0),
        carbs: Math.round(Number(meal.carbs) || 0),
        fat: Math.round(Number(meal.fat) || 0),
        timing: String(meal.timing || '').trim(),
        ingredients: Array.isArray(meal.ingredients) ? meal.ingredients.map(String).filter(Boolean) : [],
      }
    })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

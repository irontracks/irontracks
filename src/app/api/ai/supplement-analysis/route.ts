/**
 * POST /api/ai/supplement-analysis
 *
 * Generates personalized supplement recommendations based on the user's
 * profile (goal, training frequency, diet type).
 * Uses Gemini to produce structured JSON suggestions.
 */
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  goal: z.enum(['hypertrophy', 'strength', 'fat_loss', 'conditioning', 'health']),
  trainingFrequency: z.number().int().min(1).max(7),
  dietType: z.enum(['omnivore', 'vegetarian', 'vegan', 'keto', 'other']).optional(),
  budget: z.enum(['low', 'medium', 'high']).optional(),
}).strip()

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: 'hipertrofia (ganho de massa muscular)',
  strength: 'ganho de força',
  fat_loss: 'perda de gordura',
  conditioning: 'condicionamento físico',
  health: 'saúde geral',
}

const BUDGET_LABELS: Record<string, string> = {
  low: 'orçamento baixo (menos de R$200/mês)',
  medium: 'orçamento médio (R$200-500/mês)',
  high: 'orçamento alto (acima de R$500/mês)',
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`ai:supplements:${auth.user.id}:${ip}`, 5, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const access = await checkVipFeatureAccess(auth.supabase, auth.user.id, 'ai_coach')
  if (!access.allowed) return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  const parsed = await parseJsonBody(req, BodySchema)
  if (parsed.response) return parsed.response
  const { goal, trainingFrequency, dietType, budget } = parsed.data!

  const goalLabel = GOAL_LABELS[goal] || goal
  const budgetLabel = budget ? BUDGET_LABELS[budget] : 'orçamento indefinido'
  const dietLabel = dietType === 'vegan' ? 'vegano' : dietType === 'vegetarian' ? 'vegetariano' : dietType === 'keto' ? 'cetogênica' : 'onívoro'

  const prompt = `Você é um especialista em nutrição esportiva. Analise o perfil do atleta e sugira os suplementos mais relevantes.

PERFIL:
- Objetivo: ${goalLabel}
- Frequência de treino: ${trainingFrequency} dias/semana
- Dieta: ${dietLabel}
- ${budgetLabel}

Retorne SOMENTE um JSON válido com a seguinte estrutura:
{
  "recommendations": [
    {
      "name": "nome do suplemento",
      "priority": "essencial" | "importante" | "opcional",
      "benefit": "principal benefício em 1 frase",
      "dosage": "dosagem recomendada",
      "timing": "quando tomar",
      "cost_level": "baixo" | "médio" | "alto",
      "vegan_ok": true | false
    }
  ],
  "summary": "resumo de 2-3 frases sobre a stack ideal para este perfil"
}

Inclua no máximo 6 suplementos, ordenados por prioridade. Seja específico e baseado em evidências científicas.`

  try {
    const genai = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '')
    const model = genai.getGenerativeModel({ model: process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash' })
    const result = await model.generateContent(prompt)
    const text = result.response.text()

    let data: Record<string, unknown> | null = null
    try {
      const start = text.indexOf('{')
      const end = text.lastIndexOf('}')
      if (start !== -1 && end > start) {
        data = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
      }
    } catch { /* ignore */ }

    if (!data || !Array.isArray(data.recommendations)) {
      return NextResponse.json({ ok: false, error: 'invalid_ai_response' }, { status: 500 })
    }

    await incrementVipUsage(auth.supabase, auth.user.id, 'ai_coach')

    return NextResponse.json({
      ok: true,
      recommendations: data.recommendations,
      summary: String(data.summary || ''),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

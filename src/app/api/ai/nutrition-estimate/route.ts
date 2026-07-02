import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { trackMeal } from '@/lib/nutrition/engine'
import { saveLearnedFood } from '@/lib/nutrition/learned-foods'
import { sanitizeFoodName } from '@/lib/nutrition/security'
import { env } from '@/utils/env'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'
import { getGeminiModel } from '@/utils/ai/gemini'
import { buildEstimatePrompt, parseEstimateOutput } from '@/lib/nutrition/aiEstimate'

export const dynamic = 'force-dynamic'

const MODEL = env.gemini.modelId

const BodySchema = z
  .object({
    text: z.string().min(1).transform((s) => s.slice(0, 600)),
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mealName: z.string().transform((s) => s.slice(0, 60)).optional(),
    // uuid otimista da fila offline → idempotência (reenvio não duplica a refeição).
    clientId: z.string().max(64).optional(),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:nutrition-estimate:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { text, dateKey, mealName, clientId } = parsedBody.data!

    // Idempotência: se a fila offline já lançou ESTA refeição (mesmo clientId), NÃO
    // re-chama o Gemini nem re-mete a cota — devolve a linha existente. O retry só
    // ocorre quando a resposta HTTP se perdeu após o commit (rede móvel instável).
    const cid = typeof clientId === 'string' && clientId.trim() ? clientId.trim().slice(0, 64) : null
    if (cid) {
      const { data: existing } = await supabase
        .from('nutrition_meal_entries')
        .select('id, created_at, food_name, calories, protein, carbs, fat, items')
        .eq('user_id', userId)
        .eq('client_id', cid)
        .maybeSingle()
      if (existing) return NextResponse.json({ ok: true, row: existing, idempotent: true })
    }

    const access = await checkVipFeatureAccess(supabase, userId, 'nutrition_macros', { meter: true })
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
    }

    const apiKey = env.gemini.apiKey
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const prompt = buildEstimatePrompt(text)
    if (!prompt) return NextResponse.json({ ok: false, error: 'input_too_short' }, { status: 400 })

    const model = getGeminiModel(apiKey, MODEL)
    const geminiResult = await safeGemini('nutrition-estimate', () =>
      model.generateContent([{ text: prompt }]),
    )
    if ('errorResponse' in geminiResult) return geminiResult.errorResponse
    const result = geminiResult.value
    const rawText = result?.response?.text?.() || ''
    const out = parseEstimateOutput(rawText)
    if (!out) return NextResponse.json({ ok: false, error: 'invalid_ai_output' }, { status: 500 })

    const { calories, protein, carbs, fat } = out

    // Use the fixed trackMeal function instead of broken RPC.
    // A custom meal name (from the user) takes precedence over the AI-derived name.
    const customName = String(mealName ?? '').trim()
    const itemLabel = sanitizeFoodName(out.foodName || customName || 'Refeição').slice(0, 120)
    const row = await trackMeal(userId, {
      foodName: sanitizeFoodName(customName || out.foodName || 'Refeição').slice(0, 120),
      calories,
      protein,
      carbs,
      fat,
    }, dateKey, [{ label: itemLabel, grams: 0, calories, protein, carbs, fat }], clientId)

    // Auto-learn: save the AI-estimated food so the local parser
    // recognizes it next time without needing the AI again.
    await saveLearnedFood(
      supabase,
      userId,
      text,                                              // original user input
      String(out.foodName || 'Refeição').trim(),          // display name from AI
      calories,
      protein,
      carbs,
      fat,
    )

    return NextResponse.json({ ok: true, row })
  } catch (e: unknown) {
    return handleGeminiError('nutrition-estimate', e)
  }
}

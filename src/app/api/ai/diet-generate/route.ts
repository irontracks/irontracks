import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { handleGeminiError } from '@/utils/ai/handleGeminiError'
import { generateDietPlan, DietGenerateError } from '@/lib/nutrition/dietGenerate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // geração de cardápio no Gemini pode passar dos 30s padrão

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/diet-generate
 *
 * Generates a meal plan that hits the target macros using the
 * user's REAL food repertoire (built from meal history). Macro
 * totals are recomputed server-side — the LLM only chooses foods
 * and portions, never the final arithmetic. O motor de geração é
 * compartilhado com a Área do professor (lib/nutrition/dietGenerate).
 * ────────────────────────────────────────────────────────── */

const ZodBody = z.object({
  calories: z.number().positive().max(10_000),
  protein: z.coerce.number().nonnegative().max(1_000),
  carbs: z.coerce.number().nonnegative().max(2_000),
  fat: z.coerce.number().nonnegative().max(1_000),
  meals: z.number().int().min(3).max(7).optional().default(5),
  notes: z.string().transform((s) => s.slice(0, 300)).optional(),
}).strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()
    const supabase = auth.supabase

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:diet-generate:${userId}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const { allowed, limit, tier } = await checkVipFeatureAccess(supabase, userId, 'insights_weekly')
    if (!allowed) {
      return NextResponse.json({
        ok: false, error: 'vip_required',
        message: `Limite de ${limit} (${tier}). Upgrade necessário.`,
        upgradeRequired: true,
      }, { status: 403 })
    }

    const parsed = await parseJsonBody(req, ZodBody)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof ZodBody>

    const outcome = await generateDietPlan(supabase, {
      sourceUserId: userId,
      targets: { calories: body.calories, protein: body.protein, carbs: body.carbs, fat: body.fat },
      mealsCount: body.meals,
      notes: body.notes,
    })
    if (!outcome.ok) return outcome.errorResponse

    await incrementVipUsage(supabase, userId, 'insights')

    return NextResponse.json({ ok: true, plan: outcome.plan })
  } catch (e: unknown) {
    if (e instanceof DietGenerateError) {
      return NextResponse.json({ ok: false, error: e.code }, { status: 500 })
    }
    return handleGeminiError('diet-generate', e)
  }
}

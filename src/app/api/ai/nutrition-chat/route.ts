/**
 * Chat de nutrição — "se eu comer 5 ovos agora, pra quanto vai minhas kcal e macros?"
 *
 * ── A IA não faz conta ─────────────────────────────────────────────────────────
 * A aritmética é toda em TypeScript (projectMeal) e os números do histórico saem
 * pré-computados do snapshot. O modelo, quando entra, só interpreta a pergunta e
 * narra. Nesta fase ele nem entra: o atalho regex responde o caso principal com
 * ZERO Gemini, em ~200ms e sempre igual.
 *
 * ── Fronteiras de confiança ────────────────────────────────────────────────────
 * - O CONSUMIDO vem do servidor (soma crua das entries) — é fato e sustenta a
 *   promessa de bater com o diário.
 * - As METAS vêm da tela (ver o cabeçalho de chatContext.ts) — são o alvo declarado
 *   do usuário e precisam casar com o anel que ele está olhando.
 * - Esta rota NÃO escreve nada. Lançar é decisão do usuário, num toque explícito
 *   (fase 4), e persiste os items EXATOS que o card mostrou — sem re-resolver.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { resolveFood } from '@/lib/nutrition/food-resolver'
import { estimateMacrosFromText } from '@/lib/nutrition/aiEstimate'
import { sanitizeAiInput } from '@/lib/nutrition/security'
import { buildNutritionSnapshot, type SnapshotGoals, type SnapshotTotals } from '@/lib/nutrition/chatContext'
import { detectIntent } from '@/lib/nutrition/chatIntent'
import { projectMeal } from '@/lib/nutrition/chatProjection'
import { buildTemplateReply } from '@/lib/nutrition/chatReply'
import { handleGeminiError } from '@/utils/ai/handleGeminiError'

export const dynamic = 'force-dynamic'

/** Teto sanitário das metas vindas da tela — não são fato, mas também não são livres. */
const goalNumber = z.number().finite().min(0).max(20_000)

const BodySchema = z
  .object({
    question: z.string().min(1).transform((s) => s.slice(0, 500)),
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    goals: z.object({
      calories: goalNumber,
      protein: goalNumber,
      carbs: goalNumber,
      fat: goalNumber,
      source: z.enum(['saved', 'profile', 'default']),
    }),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:nutrition-chat:${userId}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { question, dateKey, goals } = parsedBody.data!

    // Mesmo balde das outras 3 rotas de nutrição (Pro/Elite, teto 200/dia).
    // Metramos ANTES de responder, como o resto do repo. Sem refund: refundVipUsage
    // só aceita chat/wizard/insights, e com teto de 200/dia perder 1 uso numa falha
    // é irrelevante (diferente do chat_daily free, 5/semana, que justificou o refund).
    const access = await checkVipFeatureAccess(supabase, userId, 'nutrition_macros', { meter: true })
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: 'vip_required', upgradeRequired: true }, { status: 403 })
    }

    const cleanQuestion = sanitizeAiInput(question)
    const snapshot = await buildNutritionSnapshot(supabase, userId, dateKey, goals as SnapshotGoals)

    const intent = detectIntent(cleanQuestion)

    // ── Caminho determinístico: reconheceu "se eu comer X" sem IA ───────────────
    if (intent.kind === 'simulate') {
      const sim = await simulate(supabase, userId, intent.foodText, snapshot.today.totals, goals)
      if (sim) return NextResponse.json({ ok: true, ...sim })
      return NextResponse.json({
        ok: true,
        reply: `Não consegui identificar "${intent.foodText}". Tenta com a quantidade — ex.: "150g de frango" ou "2 ovos".`,
        sim: null,
      })
    }

    // ── Sem Gemini ainda (fase 3): responde honesto em vez de fingir ────────────
    return NextResponse.json({
      ok: true,
      reply:
        'Por enquanto eu respondo simulações — pergunte no formato "se eu comer 5 ovos agora".',
      sim: null,
    })
  } catch (e: unknown) {
    return handleGeminiError('nutrition-chat', e)
  }
}

/**
 * Resolve o alimento pela cascata determinística e projeta. Gemini SÓ como último
 * recurso (`estimateMacrosFromText`), exatamente como a rota nutrition-estimate faz.
 * Devolve null quando nem a IA reconheceu.
 */
async function simulate(
  supabase: SupabaseClient,
  userId: string,
  foodText: string,
  consumed: SnapshotTotals,
  goals: SnapshotGoals,
) {
  const resolved = await resolveFood(supabase, userId, foodText)

  const addition = resolved
    ? resolved.meal
    : await estimateMacrosFromText(foodText).then((e) =>
        e ? { calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat } : null,
      )
  if (!addition) return null

  // Refeição zerada não é comida — é o modelo não tendo reconhecido e respondendo
  // zeros. Sem isto, "se eu comer xyzabc123" vira "Xyzabc123 — 0 kcal. Seu dia vai
  // pra 0", que soa como resposta e não é. Mesma regra do applyGeneratedMealAction
  // (actions.ts): calorias e proteína zeradas → recusa.
  if (Number(addition.calories) <= 0 && Number(addition.protein) <= 0) return null

  const items = resolved?.items?.length
    ? resolved.items.map((it) => ({
        label: String(it.label ?? '').slice(0, 120),
        grams: Number(it.grams) || 0,
        calories: Number(it.calories) || 0,
        protein: Number(it.protein) || 0,
        carbs: Number(it.carbs) || 0,
        fat: Number(it.fat) || 0,
      }))
    : [
        {
          label: foodText.slice(0, 120),
          grams: 0,
          calories: Number(addition.calories) || 0,
          protein: Number(addition.protein) || 0,
          carbs: Number(addition.carbs) || 0,
          fat: Number(addition.fat) || 0,
        },
      ]

  const projection = projectMeal(consumed, goals, addition)

  return {
    reply: buildTemplateReply(foodText, projection),
    sim: {
      foodText,
      items,
      projection,
      source: resolved?.source ?? 'ai',
    },
  }
}

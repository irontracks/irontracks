/**
 * Chat de nutrição — "se eu comer 5 ovos agora, pra quanto vai minhas kcal e macros?"
 *
 * ── A IA não faz conta ─────────────────────────────────────────────────────────
 * A aritmética é toda em TypeScript (projectMeal) e os números do histórico saem
 * pré-computados do snapshot. O modelo só INTERPRETA a pergunta e NARRA o
 * resultado — nunca soma, nunca decide macro, nunca escolhe data.
 *
 * Onde o Gemini entra (e onde não entra):
 *  - INTERPRETAÇÃO: só quando o atalho regex (chatIntent.ts) não reconhece. Pro
 *    caso de uso #1 ("se eu comer 5 ovos agora") é ZERO chamada — e é justamente
 *    a parte cara e sujeita a variação que fica de fora.
 *  - MACROS: só quando a cascata determinística inteira falha (resolveFood → null).
 *  - PROSA: sempre que houve simulação, MAS é descartável (writeProse devolve null
 *    em qualquer falha e o narrador determinístico assume). Custa 1 chamada do
 *    modelo rápido; o usuário nunca fica sem resposta por causa dela.
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
import { buildNutritionSnapshot, type SnapshotGoals, type SnapshotTotals, type NutritionSnapshot } from '@/lib/nutrition/chatContext'
import { detectIntent, cleanFoodText } from '@/lib/nutrition/chatIntent'
import { projectMeal, type MealProjection } from '@/lib/nutrition/chatProjection'
import { buildTemplateReply, type ReplyItem } from '@/lib/nutrition/chatReply'
import { buildIntentPrompt, parseIntentOutput, buildReplyPrompt, type ChatTurn } from '@/lib/nutrition/chatPrompt'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'

export const dynamic = 'force-dynamic'

/** Teto sanitário das metas vindas da tela — não são fato, mas também não são livres. */
const goalNumber = z.number().finite().min(0).max(20_000)

const BodySchema = z
  .object({
    question: z.string().min(1).transform((s) => s.slice(0, 500)),
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // Histórico curto: sem ele "e se forem 10?" não tem a que se referir. Capado em
    // 6 turnos × 500 chars — chat de nutrição não precisa de mais, e cada turno é
    // token e superfície de injection.
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          text: z.string().min(1).transform((s) => s.slice(0, 500)),
        }),
      )
      .max(6)
      .optional(),
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
    // Sanitiza CADA turno: o histórico volta pro prompt e o cliente o compõe.
    const history: ChatTurn[] = (parsedBody.data!.history ?? []).map((h) => ({
      role: h.role,
      text: sanitizeAiInput(h.text),
    }))

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
      if (sim) {
        const prose = await writeProse(cleanQuestion, intent.foodText, sim, snapshot)
        return NextResponse.json({ ok: true, ...sim, reply: prose ?? sim.reply })
      }
      return NextResponse.json({ ok: true, reply: notFoodReply(intent.foodText), sim: null })
    }

    // ── Fallback: o atalho não reconheceu → o modelo interpreta ─────────────────
    const apiKey = env.gemini.apiKey
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const intentModel = getGeminiModel(apiKey, env.gemini.fastModelId)
    const intentRes = await safeGemini('nutrition-chat:intent', () =>
      intentModel.generateContent([{ text: buildIntentPrompt(cleanQuestion, snapshot, history) }]),
    )
    if ('errorResponse' in intentRes) return intentRes.errorResponse

    const parsed = parseIntentOutput(intentRes.value?.response?.text?.() || '')
    if (!parsed) {
      return NextResponse.json({
        ok: true,
        reply: 'Não entendi. Tenta assim: "se eu comer 5 ovos agora" ou "quanto falta de proteína hoje?".',
        sim: null,
      })
    }

    // O modelo só EXTRAIU o alimento; quem resolve os macros é a cascata, não ele.
    if (parsed.intent === 'simulate' && parsed.foodQuery) {
      // A limpeza em TS de novo: o modelo tende a devolver a prosa do usuário junto.
      const foodText = cleanFoodText(parsed.foodQuery) || parsed.foodQuery
      const sim = await simulate(supabase, userId, foodText, snapshot.today.totals, goals)
      if (sim) {
        const prose = await writeProse(cleanQuestion, foodText, sim, snapshot)
        return NextResponse.json({ ok: true, ...sim, reply: prose ?? sim.reply })
      }
      return NextResponse.json({ ok: true, reply: notFoodReply(foodText), sim: null })
    }

    // 'answer' e 'refuse': o texto do modelo, lendo números que já vieram prontos.
    // `suggestions` são só TEXTOS de alimento: viram botões e, ao tocar, voltam como
    // "se eu comer X" — ou seja, passam pelo atalho + cascata determinística. O
    // número que o usuário vê continua não vindo do modelo.
    return NextResponse.json({ ok: true, reply: parsed.reply, sim: null, suggestions: parsed.suggestions })
  } catch (e: unknown) {
    return handleGeminiError('nutrition-chat', e)
  }
}

function notFoodReply(foodText: string): string {
  return `Não consegui identificar "${foodText}". Tenta com a quantidade — ex.: "150g de frango" ou "2 ovos".`
}

/**
 * Prosa da fase 2 — ENFEITE, e o código tem que provar isso.
 *
 * Os números já estão certos e já estão no card e no `sim.reply` (narrador
 * determinístico). Esta chamada só acrescenta julgamento ("cabe", "estoura a
 * gordura, troca por clara"). Por isso ela é try/catch total e devolve null em
 * QUALQUER falha: o usuário nunca perde a resposta porque o modelo caiu — e a
 * cota já foi metrada, então não faz sentido derrubar o request inteiro aqui.
 */
async function writeProse(
  question: string,
  foodText: string,
  sim: { sim: { projection: MealProjection; items: ReplyItem[] } },
  snapshot: NutritionSnapshot,
): Promise<string | null> {
  try {
    const apiKey = env.gemini.apiKey
    if (!apiKey) return null
    const model = getGeminiModel(apiKey, env.gemini.fastModelId)
    const res = await safeGemini('nutrition-chat:prose', () =>
      model.generateContent([{ text: buildReplyPrompt(question, foodText, sim.sim.projection, snapshot, sim.sim.items) }]),
    )
    if ('errorResponse' in res) return null
    const text = String(res.value?.response?.text?.() || '').trim()
    return looksComplete(text) ? text.slice(0, 1200) : null
  } catch {
    return null
  }
}

/**
 * A prosa só entra se estiver INTEIRA. Pego em verificação real: o modelo respondeu
 * "Beleza! Se você mandar 5 ovos cozidos (250g), seu dia vai ficar assim:" — e
 * parou. Ia listar os números e não listou. Uma frase pendurada em dois-pontos é
 * pior que o narrador determinístico, que sempre traz os números.
 *
 * Só recusa o que é claramente quebrado; não julga estilo — julgar estilo por regex
 * seria trocar um problema por outro.
 */
function looksComplete(text: string): boolean {
  const t = String(text ?? '').trim()
  if (t.length < 20) return false
  if (/[:,;]$/.test(t)) return false // ia continuar (lista, enumeração) e não continuou
  if (!/\d/.test(t)) return false // resposta de simulação sem NENHUM número não é resposta
  return true
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

  // A IA devolve um foodName LIMPO ("Sucrilhos com leite e doce de leite"); o
  // parser/TACO não, então aí o próprio foodText (já limpo pelo cleanFoodText) serve.
  // Guardar o nome da IA é a defesa que impede a pergunta crua de virar rótulo no
  // diário mesmo se a limpeza de texto falhar num caso novo — foi assim que
  // "...como ficará meus numero" foi parar como nome de refeição.
  let aiFoodName = ''
  const addition = resolved
    ? resolved.meal
    : await estimateMacrosFromText(foodText).then((e) => {
        if (!e) return null
        aiFoodName = String(e.foodName || '').trim()
        return { calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat }
      })
  if (!addition) return null

  // Nome de exibição: o da IA quando veio dela; senão o texto (já limpo).
  const displayName = (aiFoodName || foodText).slice(0, 120)

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
          label: displayName,
          grams: 0,
          calories: Number(addition.calories) || 0,
          protein: Number(addition.protein) || 0,
          carbs: Number(addition.carbs) || 0,
          fat: Number(addition.fat) || 0,
        },
      ]

  const projection = projectMeal(consumed, goals, addition)

  return {
    reply: buildTemplateReply(foodText, projection, items),
    sim: {
      foodText,
      // Nome pro diário/card. Nunca a pergunta crua — ver displayName acima.
      foodName: displayName,
      items,
      projection,
      source: resolved?.source ?? 'ai',
    },
  }
}

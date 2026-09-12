/**
 * POST /api/ai/exercise-chat/summary — fecha a conversa de um exercício numa
 * linha que sobrevive ao treino.
 *
 * Chamada quando o aluno sai daquele exercício. A thread inteira continua
 * gravada; o que esta rota produz é o que ele vai RELER depois, sem ter que
 * rolar a conversa — "o ajuste, a correção, a conclusão".
 *
 * ── As decisões que o próximo agente erraria ───────────────────────────────────
 *
 * 1. ⚠️ NÃO COBRA COTA, e isso é escolha. O resumo é consequência de turnos que
 *    o usuário JÁ pagou (cada pergunta metrou `chat_daily` ou `media_analysis`);
 *    cobrar de novo tiraria da pessoa uma pergunta por exercício concluído —
 *    ela pagaria para o app se organizar. O gate de TIER continua valendo (é
 *    chamada paga ao Gemini), e o freio contra abuso é o rate limit + a regra
 *    de que thread VAZIA não chama o modelo.
 *
 * 2. ⚠️ A GRAVAÇÃO É UPSERT na única (user_id, session_started_at,
 *    exercise_index). O mesmo exercício pode ser fechado mais de uma vez na
 *    mesma sessão (o aluno volta, pergunta de novo, sai de novo) e o resumo é o
 *    ÚLTIMO estado da conversa, não uma coleção de recortes. `insert` puro
 *    falharia com 23505 na segunda vez — em silêncio, porque o supabase-js
 *    devolve `{ error }` em vez de lançar.
 *
 * 3. ⚠️ `exercise_name` é o nome de AGORA, e é ele que vai na linha: a unique
 *    não o inclui de propósito, então trocar o exercício no slot substitui o
 *    resumo em vez de duplicá-lo. Quem precisa saber que o nome mudou usa o
 *    `nomeAnterior` do GET do chat.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'
import { logError } from '@/lib/logger'
import {
  carregarThread,
  montarPromptDoResumo,
  normalizarInstante,
  TETO_RESUMO,
} from '@/lib/workout/exerciseChat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_EXERCISE_INDEX = 200

const BodySchema = z
  .object({
    sessionStartedAt: z
      .string()
      .min(10)
      .max(40)
      .refine((s) => Number.isFinite(Date.parse(s)), 'sessionStartedAt inválido'),
    exerciseIndex: z.number().int().min(0).max(MAX_EXERCISE_INDEX),
    exerciseName: z.string().min(1).max(120),
  })
  .strict()

type CodigoDeErro = 'rate_limited' | 'vip_required' | 'quota' | 'ai_unavailable' | 'invalid'

const erro = (code: CodigoDeErro, status: number) =>
  NextResponse.json({ ok: false as const, error: code }, { status })

/** Mesma tradução do chat: o classificador do Gemini loga, o contrato responde. */
function traduzirErroDeIa(resposta: NextResponse): NextResponse {
  return resposta.status === 429 ? erro('rate_limited', 429) : erro('ai_unavailable', 503)
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:exercise-chat:summary:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) return erro('rate_limited', 429)

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return erro('invalid', 400)
    const { exerciseIndex, exerciseName } = parsedBody.data!
    const sessionStartedAt = normalizarInstante(parsedBody.data!.sessionStartedAt)
    if (!sessionStartedAt) return erro('invalid', 400)

    const plan = await getVipPlanLimits(supabase, userId)
    if (!plan.limits.media_analysis) return erro('vip_required', 403)

    const { rows, error: threadErr } = await carregarThread(supabase, userId, sessionStartedAt, exerciseIndex)
    if (threadErr) {
      // Aqui a leitura NÃO é opcional (diferente do chat, onde o pior caso é
      // responder sem histórico): resumir uma thread que não conseguimos ler
      // produziria um resumo inventado, gravado como se fosse a conversa.
      logError('api:ai:exercise-chat:summary:thread', threadErr)
      return erro('ai_unavailable', 503)
    }
    // Thread vazia não vira chamada paga — e não vira linha no banco.
    if (!rows.length) return erro('invalid', 400)

    const apiKey = env.gemini.apiKey
    if (!apiKey) return erro('ai_unavailable', 503)

    const model = getGeminiModel(apiKey, env.gemini.modelId, { maxOutputTokens: 300, temperature: 0.3 })
    const res = await safeGemini('exercise-chat:summary', () =>
      model.generateContent([{ text: montarPromptDoResumo(exerciseName, rows) }]),
    )
    if ('errorResponse' in res) return traduzirErroDeIa(res.errorResponse)

    const summary = String(res.value?.response?.text?.() || '').trim().slice(0, TETO_RESUMO)
    if (!summary) return erro('ai_unavailable', 503)

    const { error: upsertErr } = await supabase.from('exercise_chat_summaries').upsert(
      {
        user_id: userId,
        session_started_at: sessionStartedAt,
        exercise_index: exerciseIndex,
        exercise_name: exerciseName,
        summary,
      },
      { onConflict: 'user_id,session_started_at,exercise_index' },
    )
    // Falha de escrita é registrada e o texto ainda volta: a chamada já foi paga
    // e quem chamou tem o que mostrar. Perder a LINHA é degradação (o resumo não
    // sobrevive ao treino); descartar o texto seria perder as duas coisas.
    if (upsertErr) logError('api:ai:exercise-chat:summary:upsert', upsertErr)

    return NextResponse.json({ ok: true, summary }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: unknown) {
    return traduzirErroDeIa(handleGeminiError('exercise-chat:summary', e))
  }
}

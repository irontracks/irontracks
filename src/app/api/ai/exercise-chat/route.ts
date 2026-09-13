/**
 * POST/GET /api/ai/exercise-chat — o chat de IA do exercício da vez.
 *
 * O aluno está de pé na academia, com o aparelho na frente, e pergunta sobre
 * ESTE exercício: "estou sentindo no ombro, é normal?", "regulei certo?", e —
 * com foto ou vídeo — "é o aparelho certo?" / "a execução está correta?".
 *
 * ── As decisões que o próximo agente erraria ───────────────────────────────────
 *
 * 1. ⚠️ A MÍDIA ENTRA UMA VEZ SÓ. O vídeo vai ao Gemini no turno em que foi
 *    enviado; nos turnos seguintes o histórico volta como TEXTO (com a marca de
 *    que houve foto/vídeo). Reenviar o arquivo a cada pergunta multiplica o
 *    custo de uma chave PAGA e compartilhada com produção sem melhorar nada: o
 *    que o modelo viu já está na resposta dele, que está no histórico. Nada
 *    quebra se alguém reenviar — só a conta sobe. Regra escrita também em
 *    `lib/workout/exerciseChat.ts`.
 *
 * 2. ⚠️ A COTA tem duas chaves, e a escolha é deliberada. Turno COM mídia cobra
 *    `media_analysis` (booleana, teto anti-abuso de 20/dia), que é a MESMA
 *    chave da análise de mídia por série — esta feature absorve aquela, e dois
 *    baldes para o mesmo custo dariam ao usuário o dobro de vídeo pago por dia
 *    sem ninguém ter decidido isso. Turno de TEXTO cobra `chat_daily`, que é a
 *    chave do chat do app e já existe. O GATE de tier é um só, feito ANTES, por
 *    `limits.media_analysis`: sem ele o `chat_daily` deixaria o plano free
 *    entrar (ele vale 5/semana no free), e a feature é VIP.
 *
 * 3. ⚠️ O nome do exercício é CARIMBO, não chave. A thread é (usuário, sessão,
 *    ÍNDICE) — é o índice que a tela tem e que sobrevive a trocar o exercício
 *    no meio do treino. O GET devolve `nomeAnterior` quando o nome gravado
 *    diverge do atual, e é assim que a tela avisa que a conversa era sobre
 *    outro exercício em vez de herdá-la em silêncio.
 *
 * 4. ⚠️ O VOCABULÁRIO DE ERRO É FECHADO e três telas dependem dele:
 *    'rate_limited' | 'vip_required' | 'quota' | 'ai_unavailable' | 'invalid'.
 *    Por isso a resposta do Zod (`invalid_request`) e a do `handleGeminiError`
 *    (`ai_rate_limited`, `ai_timeout`, …) são TRADUZIDAS aqui em vez de vazarem
 *    — o `handleGeminiError` continua sendo quem classifica e LOGA o erro do
 *    Gemini; só o código que chega ao cliente muda.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody, parseSearchParams } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { checkVipFeatureAccess, getVipPlanLimits } from '@/utils/vip/limits'
import { sanitizeAiInput } from '@/lib/nutrition/security'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'
import { buildGeminiMediaPart } from '@/utils/ai/mediaPart'
import { logError } from '@/lib/logger'
import {
  carregarThread,
  historicoParaPrompt,
  montarPromptDaPergunta,
  nomeAnteriorDaThread,
  normalizarInstante,
  paraMensagensDaTela,
  TETO_PERGUNTA,
  TETO_RESPOSTA,
  type TipoDeMidia,
} from '@/lib/workout/exerciseChat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Vídeo grande sobe pela Files API e o poll até ACTIVE leva segundos — ver mediaPart.ts. */
export const maxDuration = 120

const BUCKET = 'set-media'

/** Teto do índice: treino de 200 exercícios não existe; acima disso é lixo ou script. */
const MAX_EXERCISE_INDEX = 200

const isoInstante = z
  .string()
  .min(10)
  .max(40)
  .refine((s) => Number.isFinite(Date.parse(s)), 'sessionStartedAt inválido')

const BodySchema = z
  .object({
    sessionStartedAt: isoInstante,
    exerciseIndex: z.number().int().min(0).max(MAX_EXERCISE_INDEX),
    exerciseName: z.string().min(1).max(120),
    question: z.string().min(1).max(TETO_PERGUNTA),
    media: z
      .object({
        path: z.string().min(1).max(300),
        kind: z.enum(['photo', 'video']),
        mime: z.string().min(3).max(120),
      })
      .optional(),
  })
  .strict()

const QuerySchema = z
  .object({
    sessionStartedAt: isoInstante,
    exerciseIndex: z.coerce.number().int().min(0).max(MAX_EXERCISE_INDEX),
    exerciseName: z.string().min(1).max(120),
  })
  .strip()

type CodigoDeErro = 'rate_limited' | 'vip_required' | 'quota' | 'ai_unavailable' | 'invalid'

const erro = (code: CodigoDeErro, status: number) =>
  NextResponse.json({ ok: false as const, error: code }, { status })

/**
 * Traduz a resposta do `handleGeminiError` para o vocabulário do contrato.
 *
 * O classificador dele é bom e já logou o erro cru; o que não pode vazar daqui
 * é o CÓDIGO dele, que a tela deste chat não conhece. 429 vira 'rate_limited'
 * (é limite, e a tela pede para tentar de novo); todo o resto é
 * 'ai_unavailable'.
 */
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
    const rl = await checkRateLimitAsync(`ai:exercise-chat:${userId}:${ip}`, 15, 60_000)
    if (!rl.allowed) return erro('rate_limited', 429)

    const parsedBody = await parseJsonBody(req, BodySchema)
    // A resposta do Zod fala 'invalid_request'; o contrato fala 'invalid'.
    if (parsedBody.response) return erro('invalid', 400)
    const { exerciseIndex, exerciseName, question, media } = parsedBody.data!
    const sessionStartedAt = normalizarInstante(parsedBody.data!.sessionStartedAt)
    if (!sessionStartedAt) return erro('invalid', 400)

    // O caminho da mídia é do PRÓPRIO usuário — o prefixo do bucket é o userId.
    // Sem esta checagem, um path colado de outra conta chegaria ao download com
    // o cliente autenticado e (mesmo barrado pela RLS) viraria um 500 confuso.
    if (media && !media.path.startsWith(`${userId}/`)) return erro('invalid', 400)

    // ── VIP: gate de TIER primeiro, cota depois ────────────────────────────────
    // O plano é resolvido UMA vez e repassado ao metering (opts.plan) — sem
    // isso seriam ~4 queries a mais por pergunta.
    const plan = await getVipPlanLimits(supabase, userId)
    if (!plan.limits.media_analysis) return erro('vip_required', 403)

    // ⚠️ NADA QUE AINDA POSSA DIZER "NÃO" RODA DEPOIS DO METERING.
    // `checkVipFeatureAccess({ meter: true })` INCREMENTA a cota e não há
    // reembolso nesta rota, então toda recusa determinística — chave do Gemini
    // ausente, pergunta que sobra vazia da sanitização, mídia que não baixa —
    // vem ANTES dele. A ordem antiga cobrava uma unidade de `media_analysis`
    // (20/dia) para devolver 400 a quem mandou um `path` que ainda não subiu.
    const apiKey = env.gemini.apiKey
    if (!apiKey) return erro('ai_unavailable', 503)

    const perguntaLimpa = sanitizeAiInput(question, TETO_PERGUNTA)
    if (!perguntaLimpa) return erro('invalid', 400)

    // O DOWNLOAD é do storage (barato, e a RLS do bucket é por prefixo); só o
    // que vem DEPOIS — subir pela Files API e chamar o modelo — é o que a cota
    // paga. Baixar antes de metrar é o que separa os dois.
    let bytesDaMidia: Uint8Array | null = null
    if (media) {
      const baixado = await supabase.storage.from(BUCKET).download(media.path)
      if (baixado.error || !baixado.data) {
        logError('api:ai:exercise-chat:download', baixado.error)
        return erro('invalid', 400)
      }
      bytesDaMidia = new Uint8Array(await baixado.data.arrayBuffer())
    }

    const chaveDeCota = media ? 'media_analysis' : 'chat_daily'
    const access = await checkVipFeatureAccess(supabase, userId, chaveDeCota, { meter: true, plan })
    // O tier já passou acima, então negativa aqui só pode ser teto estourado.
    if (!access.allowed) return erro('quota', 429)

    const { rows, error: threadErr } = await carregarThread(supabase, userId, sessionStartedAt, exerciseIndex)
    // Falha de leitura não derruba a pergunta: o pior caso é o modelo responder
    // sem o histórico. Mas ela é REGISTRADA — tratar erro como thread vazia em
    // silêncio é como o app ficaria "esquecendo" a conversa sem ninguém saber.
    if (threadErr) logError('api:ai:exercise-chat:thread', threadErr)

    const prompt = montarPromptDaPergunta({
      exerciseName,
      question: perguntaLimpa,
      historico: historicoParaPrompt(rows),
      midia: (media?.kind ?? null) as TipoDeMidia | null,
    })

    const partes: Array<{ text: string } | Awaited<ReturnType<typeof buildGeminiMediaPart>>> = [{ text: prompt }]

    if (media && bytesDaMidia) {
      // Inline vs Files API (com poll até ACTIVE) é decisão do mediaPart — não
      // reimplemente aqui. Ele LANÇA em falha, e o catch-all traduz.
      partes.push(await buildGeminiMediaPart(apiKey, bytesDaMidia, media.mime))
    }

    const model = getGeminiModel(apiKey, env.gemini.modelId, { maxOutputTokens: 700, temperature: 0.4 })
    const res = await safeGemini('exercise-chat', () => model.generateContent(partes))
    if ('errorResponse' in res) return traduzirErroDeIa(res.errorResponse)

    const answer = String(res.value?.response?.text?.() || '').trim().slice(0, TETO_RESPOSTA)
    if (!answer) return erro('ai_unavailable', 503)

    // ── Gravação: os dois turnos de uma vez ────────────────────────────────────
    // Se a escrita falhar, o usuário AINDA recebe a resposta que já foi paga —
    // devolver erro aqui cobraria a cota e entregaria nada. A falha vai para o
    // log (o supabase-js não lança; devolve `{ error }` — já custou caro neste
    // repo tratar isso como sucesso).
    // ⚠️ INSTANTES DISTINTOS, e é por isso que eles são escritos à mão.
    //
    // As duas linhas nascem no MESMO insert, então o `default now()` carimba as
    // duas com o mesmo microssegundo — medido na primeira conversa real em
    // produção (13/09/2026: pergunta e resposta ambas em 02:22:47.835979). Com
    // `created_at` empatado, `ORDER BY created_at` não garante ordem nenhuma, e
    // a thread podia abrir com a RESPOSTA antes da PERGUNTA.
    //
    // A leitura tem um desempate por `role` que funciona por acaso do
    // vocabulário ('assistant' < 'user' em ordem alfabética) — o dia em que
    // alguém acrescentar um papel, ou renomear, ele vira ordenação aleatória
    // sem erro nenhum. Carimbar o milissegundo aqui resolve na origem; o
    // desempate fica como segunda linha de defesa.
    const agoraMs = Date.now()
    const { error: insertErr } = await supabase.from('exercise_chat_messages').insert([
      {
        user_id: userId,
        session_started_at: sessionStartedAt,
        exercise_index: exerciseIndex,
        exercise_name: exerciseName,
        role: 'user',
        content: perguntaLimpa,
        media_path: media?.path ?? null,
        media_kind: media?.kind ?? null,
        media_mime: media?.mime ?? null,
        created_at: new Date(agoraMs).toISOString(),
      },
      {
        user_id: userId,
        session_started_at: sessionStartedAt,
        exercise_index: exerciseIndex,
        exercise_name: exerciseName,
        role: 'assistant',
        content: answer,
        created_at: new Date(agoraMs + 1).toISOString(),
      },
    ])
    if (insertErr) logError('api:ai:exercise-chat:insert', insertErr)

    return NextResponse.json({ ok: true, answer }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: unknown) {
    // handleGeminiError classifica e LOGA (inclusive as falhas do mediaPart, que
    // chegam como Error com código próprio); só o vocabulário é traduzido.
    return traduzirErroDeIa(handleGeminiError('exercise-chat', e))
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:exercise-chat:get:${userId}:${ip}`, 60, 60_000)
    if (!rl.allowed) return erro('rate_limited', 429)

    const parsed = parseSearchParams(req, QuerySchema)
    if (parsed.response) return erro('invalid', 400)
    const { exerciseIndex, exerciseName } = parsed.data!
    const sessionStartedAt = normalizarInstante(parsed.data!.sessionStartedAt)
    if (!sessionStartedAt) return erro('invalid', 400)

    // Ler a thread NÃO custa Gemini e NÃO é gate de VIP: quem perdeu o VIP
    // continua enxergando o que já conversou. O que o VIP fecha é perguntar.
    const { rows, error } = await carregarThread(supabase, userId, sessionStartedAt, exerciseIndex)
    if (error) {
      logError('api:ai:exercise-chat:get', error)
      return erro('ai_unavailable', 503)
    }

    return NextResponse.json(
      {
        ok: true,
        messages: paraMensagensDaTela(rows),
        nomeAnterior: nomeAnteriorDaThread(rows, exerciseName),
      },
      { headers: { 'cache-control': 'no-store, max-age=0' } },
    )
  } catch (e: unknown) {
    logError('api:ai:exercise-chat:get', e)
    return erro('ai_unavailable', 503)
  }
}

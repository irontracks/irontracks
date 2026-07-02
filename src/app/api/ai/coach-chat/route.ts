import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { logInfo, logError } from '@/lib/logger'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'
import { fetchRecentWorkoutHistory } from '@/utils/ai/recentWorkoutHistory'
import { buildUserContextBlock } from '@/utils/ai/userContext'

export const dynamic = 'force-dynamic'

const MODEL = env.gemini.modelId

const safeArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

const normalizeMessages = (messages: unknown) => {
  return safeArray<Record<string, unknown>>(messages)
    .map((m) => {
      const role = typeof m?.role === 'string' ? m.role.trim() : ''
      const content = typeof m?.content === 'string' ? m.content.trim() : ''
      if (!role || !content) return null
      if (!['user', 'assistant', 'system'].includes(role)) return null
      return { role, content }
    })
    .filter(Boolean)
}

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(2000),  // R3#7: Limit content size to prevent DoS
})

const BodySchema = z
  .object({
    messages: z.array(MessageSchema).max(20).default([]),  // R3#7: Limit array size
    context: z.record(z.unknown()).nullable().optional(),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:coach-chat:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const messages = normalizeMessages(body.messages)
    const context = body.context ?? null

    // Cota consumida ATÔMICA aqui (meter), depois do parse e antes do Gemini: fecha a
    // janela TOCTOU do antigo check-then-act (que deixava requests paralelos furarem o
    // limite e queimarem cota de IA paga). Um corpo malformado é rejeitado acima, sem
    // consumir cota. Consome uma única vez — não há incremento pós-resposta.
    const access = await checkVipFeatureAccess(supabase, userId, 'chat_daily', { meter: true })
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'limit_reached', upgradeRequired: true, message: 'Limite de mensagens atingido. Faça upgrade para continuar.' },
        { status: 403 },
      )
    }

    // Pull a compact summary of the user's last 5 workouts so the coach can
    // answer questions about progression, weights, recent volume, etc.
    // Without this, the chat had no access to the user's history and would
    // tell them "I don't have your performance data" — even when the report
    // shows everything. (Reported by user testing 2026-05-03.)
    const recentHistory = await fetchRecentWorkoutHistory(supabase, userId, 5)

    const userCtx = await buildUserContextBlock(supabase, userId, ['profile', 'assessment', 'training', 'nutrition', 'labs'])

    const apiKey = env.gemini.apiKey
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'API de IA não configurada. Configure GOOGLE_GENERATIVE_AI_API_KEY na Vercel (Environment Variables → Preview/Production) e faça Redeploy.',
        },
        { status: 500 },
      )
    }

    const prompt = [
      ...(userCtx ? [userCtx, ''] : []),
      'Você é um coach de musculação do app IronTracks.',
      'Personalize pelo CONTEXTO DO USUÁRIO acima (objetivo, avaliação, exames, treino, nutrição).',
      'Responda sempre em pt-BR, de forma objetiva e prática.',
      'Não invente números; use apenas o que o usuário forneceu.',
      'Quando o usuário pedir um treino, monte um treino completo com nome, exercícios, séries, repetições, descanso e método de cada exercício.',
      '',
      'Histórico recente do usuário (últimos treinos completados):',
      'Cada exercício traz `setsPlanned` (programado) e `setsDone` (com peso/reps registrados).',
      '`topSet` é o set mais pesado registrado; `volumeKg` é o volume total acumulado nesse exercício.',
      'Quando `setsDone === 0` mas `setsPlanned > 0`, significa que o usuário fez o exercício mas não registrou os números — comente isso, NÃO afirme que ele não treinou.',
      'Quando `topSet` ou `volumeKg` vierem populados, USE esses números para falar sobre carga e progressão — não invente "não tenho dados".',
      'Histórico:',
      recentHistory ? JSON.stringify(recentHistory) : '[]',
      '',
      'Contexto adicional fornecido pelo cliente (pode ser null — geralmente o treino atual em foco):',
      JSON.stringify(context),
      '',
      'Conversa:',
      JSON.stringify(messages),
      '',
      'Responda com o texto final do coach (sem markdown).',
    ].join('\n')

    const model = getGeminiModel(apiKey, MODEL)
    const geminiResult = await safeGemini('coach-chat', () =>
      model.generateContent([{ text: prompt }] as Parameters<typeof model.generateContent>[0]),
    )
    if ('errorResponse' in geminiResult) return geminiResult.errorResponse
    const result = geminiResult.value
    const text = String((await result?.response?.text()) || '').trim()
    if (!text) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    // ── Server-side workout extraction ──────────────────────────
    // For any response that's long enough to be a workout,
    // attempt to extract structured workout data via a fast 2nd call.
    let workout: Record<string, unknown> | null = null
    const lowerText = text.toLowerCase()

    // Very broad detection: any 2 of these signals trigger extraction
    const signals = [
      lowerText.includes('exercício') || lowerText.includes('exercicio') || lowerText.includes('exercícios'),
      lowerText.includes('série') || lowerText.includes('series') || lowerText.includes('séries'),
      lowerText.includes('rep') || lowerText.includes('repetições') || lowerText.includes('repetiç'),
      /\d+\s*x\s*\d+/.test(lowerText), // pattern like "3x12" or "4 x 10"
      lowerText.includes('descanso') || lowerText.includes('intervalo'),
      lowerText.includes('treino de') || lowerText.includes('treino para'),
      lowerText.includes('supino') || lowerText.includes('agachamento') || lowerText.includes('rosca'),
    ]
    const signalCount = signals.filter(Boolean).length
    const shouldExtract = signalCount >= 2 || (text.length > 300 && signalCount >= 1)

    if (shouldExtract) {
      try {
        const extractPrompt = [
          'Dado o texto abaixo, extraia o treino como JSON.',
          'Responda APENAS com o JSON, sem explicação, sem markdown, sem blocos de código.',
          'Formato obrigatório:',
          '{"title":"Nome do Treino","exercises":[{"name":"Supino Reto","sets":4,"reps":"8-12","rest_time":60,"method":"Normal","notes":""}]}',
          'Se não houver treino no texto, responda apenas: null',
          '',
          'Texto:',
          text,
        ].join('\n')

        const extractGemini = await safeGemini('coach-chat:extract', () =>
          model.generateContent([{ text: extractPrompt }] as Parameters<typeof model.generateContent>[0]),
        )
        if ('errorResponse' in extractGemini) {
          // Extraction is best-effort — if it fails, return the main answer
          // without workout data rather than erroring the whole response.
          logError('api:ai:coach-chat', 'extract step failed; skipping workout extraction')
        } else {
          const extractResult = extractGemini.value
          const jsonStr = String((await extractResult?.response?.text()) || '').trim()

          if (jsonStr && jsonStr !== 'null' && jsonStr !== '{}') {
            // Clean markdown wrappers, whitespace, etc
            const cleaned = jsonStr
              .replace(/^```(?:json)?\s*/i, '')
              .replace(/\s*```\s*$/i, '')
              .replace(/^\s*json\s*/i, '')
              .trim()

            const parsed = JSON.parse(cleaned)
            if (parsed?.title && Array.isArray(parsed?.exercises) && parsed.exercises.length > 0) {
              workout = parsed
              logInfo('api:ai:coach-chat', 'Workout extracted', { title: parsed.title, exercises: parsed.exercises.length })
            }
          }
        }
      } catch (extractErr) {
        logError('api:ai:coach-chat', extractErr)
      }
    }

    return NextResponse.json({ ok: true, content: text, workout })
  } catch (e: unknown) {
    return handleGeminiError('coach-chat', e)
  }
}



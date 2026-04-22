import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { env } from '@/utils/env'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'

export const dynamic = 'force-dynamic'

const MODEL = env.gemini.modelId

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(1000),
})

const BodySchema = z.object({
  exerciseName: z.string().min(1).max(120),
  setsPlanned: z.number().int().min(0).max(99).optional(),
  setsDone: z.number().int().min(0).max(99).optional(),
  repsPlanned: z.string().max(40).optional(),
  weight: z.string().max(30).optional(),
  method: z.string().max(60).optional(),
  muscleGroup: z.string().max(80).optional(),
  notes: z.string().max(400).optional(),
  messages: z.array(MessageSchema).max(20).default([]),
}).strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:exercise-chat:${userId}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!

    const apiKey = env.gemini.apiKey
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'IA não configurada.' }, { status: 500 })
    }

    // Build rich system context
    const contextLines = [
      `Exercício: ${body.exerciseName}`,
      body.muscleGroup ? `Músculo principal: ${body.muscleGroup}` : null,
      body.method && body.method !== 'Normal' ? `Método de treino: ${body.method}` : null,
      body.setsPlanned ? `Séries planejadas: ${body.setsPlanned}` : null,
      body.setsDone !== undefined ? `Séries concluídas: ${body.setsDone}` : null,
      body.repsPlanned ? `Repetições planejadas: ${body.repsPlanned}` : null,
      body.weight ? `Peso atual: ${body.weight}` : null,
      body.notes ? `Observações do treino: "${body.notes}"` : null,
    ].filter(Boolean).join('\n')

    // Format conversation history for the prompt
    const historyText = body.messages.length > 0
      ? body.messages.map(m => `${m.role === 'user' ? 'Atleta' : 'Coach'}: ${m.content}`).join('\n')
      : ''

    const lastUserMessage = body.messages.filter(m => m.role === 'user').at(-1)?.content ?? ''

    const prompt = [
      'Você é um coach de musculação especialista do app IronTracks.',
      'O atleta está AGORA fazendo o seguinte exercício:',
      contextLines,
      '',
      'Regras:',
      '- Responda SEMPRE em português brasileiro.',
      '- Seja direto, prático e técnico. Máximo 3-4 frases curtas.',
      '- Foque apenas no exercício e contexto acima.',
      '- Não invente dados que não foram fornecidos.',
      '- Use linguagem de coach de academia, não de médico.',
      '',
      historyText ? `Histórico da conversa:\n${historyText}\n` : '',
      `Pergunta atual do atleta: ${lastUserMessage}`,
      '',
      'Responda agora como coach (sem markdown, sem JSON):',
    ].filter(s => s !== null).join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })
    const geminiResult = await safeGemini('exercise-chat', () =>
      model.generateContent([{ text: prompt }] as Parameters<typeof model.generateContent>[0]),
    )
    if ('errorResponse' in geminiResult) return geminiResult.errorResponse
    const result = geminiResult.value
    const text = String((await result?.response?.text()) || '').trim()

    if (!text) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    return NextResponse.json({ ok: true, content: text })
  } catch (e: unknown) {
    return handleGeminiError('exercise-chat', e)
  }
}

import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimit, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeArray = <T,>(v: any): T[] => (Array.isArray(v) ? (v as T[]) : [])

const normalizeMessages = (messages: any) => {
  return safeArray<any>(messages)
    .map((m) => {
      const role = String(m?.role || '').trim()
      const content = String(m?.content || '').trim()
      if (!role || !content) return null
      if (!['user', 'assistant', 'system'].includes(role)) return null
      return { role, content }
    })
    .filter(Boolean)
}

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
})

const BodySchema = z
  .object({
    messages: z.array(MessageSchema).default([]),
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
    const rl = checkRateLimit(`ai:coach-chat:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkVipFeatureAccess(supabase, userId, 'chat_daily')
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'limit_reached', upgradeRequired: true, message: 'Limite de mensagens atingido. Faça upgrade para continuar.' },
        { status: 403 },
      )
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const messages = normalizeMessages(body.messages)
    const context = body.context ?? null

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
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
      'Você é um coach de musculação do app IronTracks.',
      'Responda sempre em pt-BR, de forma objetiva e prática.',
      'Não invente números; use apenas o que o usuário forneceu.',
      '',
      'Contexto (pode ser null):',
      JSON.stringify(context),
      '',
      'Conversa:',
      JSON.stringify(messages),
      '',
      'Responda apenas com o texto final do coach (sem JSON e sem markdown).',
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })
    const result = await model.generateContent([{ text: prompt }] as any)
    const text = String((await result?.response?.text()) || '').trim()
    if (!text) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    await incrementVipUsage(supabase, userId, 'chat')
    return NextResponse.json({ ok: true, content: text })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

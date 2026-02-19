import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimit, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: MODEL })

const BodySchema = z
  .object({
    message: z.string().min(1),
    mode: z.enum(['general', 'nutrition', 'programming']).default('general'),
  })
  .strict()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimit(`ai:vip-coach:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const access = await checkVipFeatureAccess(supabase, userId, 'chat_daily')
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, error: 'limit_reached', upgradeRequired: true, message: 'Limite de mensagens atingido. Faça upgrade para continuar.' },
        { status: 403 },
      )
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { message, mode } = parsedBody.data!

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

    const system = [
      'Você é um coach de musculação do IronTracks (VIP).',
      'Responda em pt-BR, em tom direto e prático.',
      'Evite conselhos médicos. Se houver dor/lesão, recomende procurar profissional.',
      'Não invente números.',
    ].join('\n')

    const modeHint =
      mode === 'nutrition'
        ? 'Foque em nutrição prática e aderência.'
        : mode === 'programming'
          ? 'Foque em periodização e organização do treino.'
          : 'Foque em treino, progressão e recuperação.'

    const prompt = [system, '', modeHint, '', 'Mensagem do usuário:', message].join('\n')

    const result = await model.generateContent([{ text: prompt }] as any)
    const answer = String((await result?.response?.text()) || '').trim()
    if (!answer) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    await incrementVipUsage(supabase, userId, 'chat')
    return NextResponse.json({ ok: true, answer, dataUsed: [], followUps: [], actions: [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

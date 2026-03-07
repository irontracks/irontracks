import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const TEAM_AI_MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const ZodBody = z.object({
    sessionId: z.string().optional(),
    participants: z.array(z.object({
        userId: z.string(),
        displayName: z.string(),
        totalVolume: z.number().optional(),
        setsCompleted: z.number().optional(),
        topExercise: z.string().optional(),
        topWeight: z.number().optional(),
        prsAchieved: z.number().optional(),
    })).min(1).max(5),
    workoutName: z.string().optional(),
    durationMinutes: z.number().optional(),
}).strip()

function extractJson(text: string): unknown {
    const cleaned = String(text || '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try { return JSON.parse(cleaned.slice(start, end + 1)) } catch { return null }
}

/**
 * POST /api/ai/team-workout-insights
 * Generates comparative AI insights for a team workout session.
 * Input: participants with volume/sets/PRs, workoutName, durationMinutes.
 * Output: { ok, insights } with mvp, summary, perParticipant advice, teamHighlights.
 */
export async function POST(req: Request) {
    try {
        const auth = await requireUser()
        if (!auth.ok) return auth.response
        const userId = String(auth.user.id || '').trim()

        const ip = getRequestIp(req)
        const rl = await checkRateLimitAsync(`ai:team-insights:${userId}:${ip}`, 5, 60_000)
        if (!rl.allowed) {
            return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } })
        }

        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
        if (!apiKey) {
            return NextResponse.json({ ok: false, error: 'IA não configurada.' }, { status: 400 })
        }

        const parsed = await parseJsonBody(req, ZodBody)
        if (parsed.response) return parsed.response
        const body = parsed.data as z.infer<typeof ZodBody>

        const participantsText = body.participants.map((p, i) =>
            `Participante ${i + 1}: ${p.displayName} — Volume: ${p.totalVolume ?? 0}kg·reps, Séries: ${p.setsCompleted ?? 0}, PRs: ${p.prsAchieved ?? 0}${p.topExercise ? `, Destaque: ${p.topExercise}${p.topWeight ? ` (${p.topWeight}kg)` : ''}` : ''}`
        ).join('\n')

        const prompt = [
            'Você é um coach de musculação e analista de performance do app IronTracks.',
            'Analise os resultados de uma sessão de treino em EQUIPE e gere insights comparativos.',
            '',
            `Treino: ${body.workoutName || 'Treino em equipe'}`,
            `Duração: ${body.durationMinutes ?? 0} minutos`,
            `Participantes:\n${participantsText}`,
            '',
            'Retorne APENAS um JSON válido (sem markdown, sem texto extra) com esta estrutura:',
            '{',
            '  "mvp": string (nome do MVP e motivo em 1 frase),',
            '  "teamSummary": string[] (3-5 bullets sobre a performance geral da equipe),',
            '  "highlights": string[] (2-4 momentos de destaque),',
            '  "perParticipant": { "[displayName]": string } (1-2 frases de feedback individual por person),',
            '  "nextSessionTip": string (1 dica prática para a próxima sessão em equipe)',
            '}',
            '',
            'Regras: pt-BR, objetivo, positivo mas honesto, 1-2 frases por campo. Não invente números.',
        ].join('\n')

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: TEAM_AI_MODEL })
        const result = await model.generateContent(prompt)
        const text = (await result?.response?.text()) || ''
        const raw = extractJson(text)
        if (!raw || typeof raw !== 'object') {
            return NextResponse.json({ ok: false, error: 'Resposta inválida da IA.' }, { status: 400 })
        }

        const insights = raw as Record<string, unknown>
        return NextResponse.json({ ok: true, insights })
    } catch (e: unknown) {
        const msg = (e as Record<string, unknown>)?.message
        return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
    }
}

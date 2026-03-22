import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/exercise-swap
 *
 * Suggests 4 alternative exercises that target the same
 * muscle groups and movement pattern. Uses Gemini for
 * intelligent, context-aware suggestions.
 * ────────────────────────────────────────────────────────── */

const ZodBody = z.object({
  exerciseName: z.string().min(1),
  method: z.string().optional(),
  muscleGroup: z.string().optional(),
  equipment: z.string().optional(),
  reason: z.string().optional(), // e.g. "equipment busy", "pain", "variety"
}).strip()

const MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const extractJson = (text: string) => {
  const t = text.trim()
  const direct = parseJsonWithSchema(t, z.unknown())
  if (direct) return direct
  const s = t.indexOf('[')
  const e = t.lastIndexOf(']')
  if (s >= 0 && e > s) return parseJsonWithSchema(t.slice(s, e + 1), z.unknown())
  const s2 = t.indexOf('{')
  const e2 = t.lastIndexOf('}')
  if (s2 >= 0 && e2 > s2) return parseJsonWithSchema(t.slice(s2, e2 + 1), z.unknown())
  return null
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:exercise-swap:${userId}:${ip}`, 15, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      )
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'AI não configurada' }, { status: 400 })
    }

    const parsed = await parseJsonBody(req, ZodBody)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof ZodBody>

    const prompt = [
      'Você é um especialista em musculação e biomecânica.',
      `O atleta quer uma alternativa para o exercício: "${body.exerciseName}".`,
      body.muscleGroup ? `Grupo muscular alvo: ${body.muscleGroup}` : '',
      body.method ? `Método de treino: ${body.method}` : '',
      body.equipment ? `Equipamento disponível: ${body.equipment}` : '',
      body.reason ? `Motivo da troca: ${body.reason}` : '',
      '',
      'Retorne APENAS um JSON array com exatamente 4 exercícios alternativos:',
      '[',
      '  {',
      '    "name": string (nome do exercício em pt-BR),',
      '    "reason": string (1 frase explicando por que é boa alternativa),',
      '    "similarity": number (0-100, quão similar ao original),',
      '    "muscleGroups": string[] (grupos musculares trabalhados),',
      '    "equipment": string (equipamento necessário)',
      '  }',
      ']',
      '',
      'Regras:',
      '- Ordene do mais similar para o menos similar.',
      '- Inclua pelo menos 1 opção com equipamento livre (haltere/barra).',
      '- Inclua pelo menos 1 opção com máquina/cabos.',
      '- Todos devem trabalhar os mesmos grupos musculares primários.',
      '- Sem markdown, sem texto extra, APENAS o JSON array.',
    ].filter(Boolean).join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL_ID })
    const result = await model.generateContent(prompt)
    const text = (await result?.response?.text()) || ''

    const parsed2 = extractJson(text)
    if (!parsed2 || !Array.isArray(parsed2)) {
      return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })
    }

    const alternatives = (parsed2 as unknown[])
      .filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object')
      .slice(0, 4)
      .map(x => ({
        name: String(x.name || '').trim(),
        reason: String(x.reason || '').trim(),
        similarity: Math.max(0, Math.min(100, Number(x.similarity) || 0)),
        muscleGroups: Array.isArray(x.muscleGroups) ? x.muscleGroups.map(String) : [],
        equipment: String(x.equipment || '').trim(),
      }))
      .filter(x => x.name)

    return NextResponse.json({ ok: true, alternatives })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

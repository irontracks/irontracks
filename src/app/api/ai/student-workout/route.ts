import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/student-workout
 *
 * Feature 17: Sugestão de Treino para Aluno (Coach)
 * Generates a personalized workout plan for a specific
 * student based on their profile, assessments, and history.
 * ────────────────────────────────────────────────────────── */

const MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const ZodBody = z.object({
  studentId: z.string().min(1),
  focus: z.string().optional(), // e.g. "hipertrofia", "força", "definição"
  daysPerWeek: z.number().int().min(1).max(7).optional().default(4),
  limitations: z.string().optional(), // e.g. "lesão no ombro", "problema no joelho"
}).strip()

const extractJson = (text: string) => {
  const t = text.trim()
  const direct = parseJsonWithSchema(t, z.unknown())
  if (direct) return direct
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s >= 0 && e > s) return parseJsonWithSchema(t.slice(s, e + 1), z.unknown())
  return null
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:student-workout:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'AI não configurada' }, { status: 400 })

    const parsed = await parseJsonBody(req, ZodBody)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof ZodBody>

    const admin = createAdminClient()

    // Fetch student data
    const { data: profile } = await admin
      .from('profiles')
      .select('id, name, gender, birth_date, height_cm, weight_kg')
      .eq('id', body.studentId)
      .maybeSingle()

    // Fetch latest assessment
    const { data: assessment } = await admin
      .from('assessments')
      .select('*')
      .eq('user_id', body.studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Fetch recent sessions for training level
    const { data: recentSessions } = await admin
      .from('workouts')
      .select('id, name, date')
      .eq('user_id', body.studentId)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .limit(10)

    const prompt = [
      'Você é um personal trainer especializado em prescrição de treinos.',
      `Crie um plano de treino para o aluno abaixo.`,
      '',
      `Foco: ${body.focus || 'hipertrofia'}`,
      `Dias/semana: ${body.daysPerWeek}`,
      body.limitations ? `Limitações: ${body.limitations}` : '',
      '',
      'Retorne APENAS JSON:',
      '{',
      '  "planName": string,',
      '  "description": string (resumo do plano em 1-2 frases),',
      '  "days": [',
      '    {',
      '      "name": string (ex: "Treino A - Peito e Tríceps"),',
      '      "exercises": [',
      '        {',
      '          "name": string,',
      '          "sets": number,',
      '          "reps": string (ex: "8-12"),',
      '          "rest": number (seconds),',
      '          "method": string (ex: "Normal", "Drop-set", "Rest-Pause"),',
      '          "notes": string (dicas de execução)',
      '        }',
      '      ]',
      '    }',
      '  ],',
      '  "periodization": string (tipo de periodização sugerida),',
      '  "notes": string (orientações gerais)',
      '}',
      '',
      'Dados do aluno:',
      JSON.stringify({
        profile: profile || {},
        assessment: assessment || null,
        recentSessionCount: recentSessions?.length || 0,
      }),
    ].filter(Boolean).join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL_ID })
    const result = await model.generateContent(prompt)
    const text = (await result?.response?.text()) || ''
    const parsed2 = extractJson(text)

    if (!parsed2) return NextResponse.json({ ok: false, error: 'Resposta inválida' }, { status: 400 })

    return NextResponse.json({ ok: true, plan: parsed2 })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/assessment-report
 *
 * Feature 16: AI Assessment Report
 * Generates a professional analysis of a student's physical
 * assessment with comparative insights and recommendations.
 * ────────────────────────────────────────────────────────── */

const MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const ZodBody = z.object({
  studentId: z.string().min(1),
  assessmentId: z.string().optional(),
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
    const rl = await checkRateLimitAsync(`ai:assessment-report:${userId}:${ip}`, 10, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'AI não configurada' }, { status: 400 })

    const parsed = await parseJsonBody(req, ZodBody)
    if (parsed.response) return parsed.response
    const body = parsed.data as z.infer<typeof ZodBody>

    const admin = createAdminClient()

    // Fetch student profile
    const { data: profile } = await admin
      .from('profiles')
      .select('id, name, email, gender, birth_date')
      .eq('id', body.studentId)
      .maybeSingle()

    // Fetch last 3 assessments
    const { data: assessments } = await admin
      .from('assessments')
      .select('id, user_id, created_at, weight_kg, height_cm, body_fat_pct, muscle_mass_kg, notes, goals, measurements')
      .eq('user_id', body.studentId)
      .order('created_at', { ascending: false })
      .limit(3)

    if (!assessments || assessments.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nenhuma avaliação encontrada' }, { status: 404 })
    }

    const prompt = [
      'Você é um educador físico especializado em avaliação física e prescrição de exercícios.',
      'Gere um relatório profissional da avaliação física do aluno.',
      '',
      'Retorne APENAS JSON:',
      '{',
      '  "overallScore": number (1-10),',
      '  "summary": string (resumo executivo em 2-3 frases),',
      '  "bodyComposition": { "analysis": string, "trend": "improving"|"stable"|"declining" },',
      '  "strengths": string[] (3-5 pontos fortes),',
      '  "improvements": string[] (3-5 áreas para melhorar),',
      '  "recommendations": [{ "area": string, "action": string, "priority": "high"|"medium"|"low" }],',
      '  "comparison": string (comparação com avaliação anterior se disponível),',
      '  "goals": string[] (2-3 metas sugeridas para próximo período)',
      '}',
      '',
      'Dados do aluno:',
      JSON.stringify({ profile, assessments }),
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL_ID })
    const result = await model.generateContent(prompt)
    const text = (await result?.response?.text()) || ''
    const parsed2 = extractJson(text)

    if (!parsed2) return NextResponse.json({ ok: false, error: 'Resposta inválida' }, { status: 400 })

    return NextResponse.json({ ok: true, report: parsed2, studentName: profile?.name || 'Aluno' })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/weekly-report
 *
 * Generates a narrative weekly training report using Gemini.
 * Analyzes the user's sessions from the past 7 days.
 * ────────────────────────────────────────────────────────── */

const MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'

const safeJsonParse = (raw: string) => parseJsonWithSchema(raw.trim(), z.unknown())

const extractJson = (text: string) => {
  const t = text.trim()
  const direct = safeJsonParse(t)
  if (direct) return direct
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s >= 0 && e > s) return safeJsonParse(t.slice(s, e + 1))
  return null
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()
    const supabase = auth.supabase

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:weekly-report:${userId}:${ip}`, 5, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const { allowed, limit, tier } = await checkVipFeatureAccess(supabase, userId, 'insights_weekly')
    if (!allowed) {
      return NextResponse.json({
        ok: false, error: 'vip_required',
        message: `Limite de ${limit} relatórios semanais (${tier}). Faça upgrade.`,
        upgradeRequired: true
      }, { status: 403 })
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'AI não configurada' }, { status: 400 })

    // Fetch last 7 days of sessions
    const admin = createAdminClient()
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()

    const { data: sessions, error: sErr } = await admin
      .from('workouts')
      .select('id, name, notes, date, created_at')
      .eq('user_id', userId)
      .eq('is_template', false)
      .gte('date', weekAgo.slice(0, 10))
      .order('date', { ascending: true })
      .limit(20)

    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 })

    const sessionData = (sessions || []).map(row => {
      const r = row as Record<string, unknown>
      const notes = r.notes
      const session = (() => {
        if (!notes) return null
        if (typeof notes === 'object') return notes as Record<string, unknown>
        try { return JSON.parse(String(notes)) as Record<string, unknown> } catch { return null }
      })()
      return {
        name: String(r.name || ''),
        date: String(r.date || r.created_at || ''),
        exercises: session ? (Array.isArray(session.exercises) ? session.exercises : []) : [],
        logs: session?.logs || {},
        duration: session?.durationMinutes || session?.duration || null,
      }
    })

    if (sessionData.length === 0) {
      return NextResponse.json({
        ok: true,
        report: {
          summary: 'Nenhum treino registrado esta semana.',
          sessions: 0,
          highlights: [],
          warnings: [],
          muscleBalance: [],
          motivation: 'Hora de começar! Um treino hoje pode ser o começo de algo incrível. 💪',
        }
      })
    }

    const prompt = [
      'Você é um coach de musculação e analista de performance.',
      `Analise os ${sessionData.length} treinos da última semana deste atleta.`,
      '',
      'Retorne APENAS JSON (sem markdown) com esta estrutura:',
      '{',
      '  "summary": string (resumo narrativo em 2-3 frases, pt-BR),',
      '  "sessions": number,',
      '  "totalVolume": number (kg),',
      '  "highlights": string[] (3-5 destaques positivos, curtos),',
      '  "warnings": string[] (0-3 pontos de atenção),',
      '  "muscleBalance": [{ "group": string, "status": "ok"|"deficit"|"excess", "suggestion": string }],',
      '  "progressionTips": string[] (2-3 dicas de progressão para próxima semana),',
      '  "motivation": string (frase motivacional personalizada, em pt-BR)',
      '}',
      '',
      'Regras:',
      '- Seja objetivo e prático.',
      '- Use apenas dados fornecidos, não invente números.',
      '- muscleBalance deve ter pelo menos os 6 principais grupos.',
      '',
      'Treinos da semana:',
      JSON.stringify(sessionData),
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL_ID })
    const result = await model.generateContent(prompt)
    const text = (await result?.response?.text()) || ''
    const parsed = extractJson(text)

    if (!parsed) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    await incrementVipUsage(supabase, userId, 'insights')

    return NextResponse.json({ ok: true, report: parsed })
  } catch (e: unknown) {
    const msg = (e as Record<string, unknown>)?.message
    return NextResponse.json({ ok: false, error: typeof msg === 'string' ? msg : String(e) }, { status: 500 })
  }
}

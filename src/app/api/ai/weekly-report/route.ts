import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonWithSchema } from '@/utils/zod'
import { z } from 'zod'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini, handleGeminiError } from '@/utils/ai/handleGeminiError'
import { buildUserContextBlock } from '@/utils/ai/userContext'
import { respondDbError } from '@/utils/api/dbError'
import { setVolume, isWorkingSet } from '@/utils/report/setVolume'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────────────────
 * POST /api/ai/weekly-report
 *
 * Generates a narrative weekly training report using Gemini.
 * Analyzes the user's sessions from the past 7 days.
 * ────────────────────────────────────────────────────────── */

const MODEL_ID = env.gemini.modelId

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

    const apiKey = env.gemini.apiKey
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

    if (sErr) return respondDbError('ai:weekly-report', sErr, 500)

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

    const userCtx = await buildUserContextBlock(admin, userId, ['profile', 'assessment', 'training', 'nutrition'])

    // Agregados computados no SERVIDOR, com a mesma fonte canônica do relatório
    // (setVolume trata unilateral/cluster/dropset; isWorkingSet filtra aquecimento).
    // Antes o schema pedia "sessions" e "totalVolume" ao próprio modelo, com os
    // logs crus no payload — LLM fazendo aritmética inventa número (o relatório
    // pós-treino chegou a exibir 18.232 kg onde o real era 26.300).
    const officialTotals = (() => {
      let volumeKg = 0
      let setsDone = 0
      for (const s of sessionData) {
        const logs = s.logs && typeof s.logs === 'object' ? (s.logs as Record<string, unknown>) : {}
        for (const log of Object.values(logs)) {
          if (!log || typeof log !== 'object') continue
          if (!isWorkingSet(log)) continue
          setsDone += 1
          const vol = setVolume(log)
          if (Number.isFinite(vol) && vol > 0) volumeKg += vol
        }
      }
      return { sessions: sessionData.length, totalVolumeKg: Math.round(volumeKg), totalSetsDone: setsDone }
    })()

    const prompt = [
      userCtx,
      'Você é um coach de musculação e analista de performance.',
      `Analise os ${sessionData.length} treinos da última semana deste atleta.`,
      'Personalize pelo CONTEXTO DO USUÁRIO acima (objetivo/restrições, avaliação, exames, números de treino).',
      '',
      'Retorne APENAS JSON (sem markdown) com esta estrutura:',
      '{',
      '  "summary": string (resumo narrativo em 2-3 frases, pt-BR),',
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
      '- PROIBIDO somar, contar ou recalcular a partir dos logs. Todo número agregado (volume total, nº de séries, nº de treinos) DEVE ser copiado LITERALMENTE das MÉTRICAS OFICIAIS abaixo.',
      '- muscleBalance deve ter pelo menos os 6 principais grupos.',
      '',
      'MÉTRICAS OFICIAIS DA SEMANA (fonte de verdade — copie EXATAMENTE, NÃO recalcule):',
      JSON.stringify(officialTotals),
      '',
      'Treinos da semana (detalhe por série — use para qualidade/equilíbrio muscular, NUNCA para somar totais):',
      JSON.stringify(sessionData),
    ].filter(Boolean).join('\n')

    const model = getGeminiModel(apiKey, MODEL_ID)
    const geminiResult = await safeGemini('weekly-report', () =>
      model.generateContent(prompt),
    )
    if ('errorResponse' in geminiResult) return geminiResult.errorResponse
    const result = geminiResult.value
    const text = (await result?.response?.text()) || ''
    const parsed = extractJson(text)

    if (!parsed) return NextResponse.json({ ok: false, error: 'Resposta inválida da IA' }, { status: 400 })

    await incrementVipUsage(supabase, userId, 'insights')

    // Os agregados são SEMPRE os do servidor, nunca os que o modelo devolveu:
    // o texto pode narrar, mas o número exibido vem do cálculo canônico.
    const report = {
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
      sessions: officialTotals.sessions,
      totalVolume: officialTotals.totalVolumeKg,
      totalSets: officialTotals.totalSetsDone,
    }

    return NextResponse.json({ ok: true, report })
  } catch (e: unknown) {
    return handleGeminiError('weekly-report', e)
  }
}

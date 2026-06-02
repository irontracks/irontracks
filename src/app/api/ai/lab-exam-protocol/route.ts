/**
 * API: POST /api/ai/lab-exam-protocol
 *
 * O coração da feature. Cruza 4 fontes de dados e gera um protocolo integrado
 * (treino + dieta + suplementação com doses) usando o Gemini Pro:
 *   1) Marcadores do exame (lab_exams.extracted_markers — precisa ter rodado o extract)
 *   2) Última avaliação física (assessments)
 *   3) Laudo da avaliação por foto mais recente (body_photo_assessments)
 *   4) Janela de treino dos últimos 90 dias (workouts → aggregateTrainingWindow)
 *
 * O disclaimer médico é FIXO (não vem da IA) e anexado pela UI.
 *
 * Feature VIP (pro+). Rate limit: 5 req/min por usuário (Gemini Pro é caro).
 */
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { env } from '@/utils/env'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { logError } from '@/lib/logger'
import { aggregateTrainingWindow } from '@/utils/bodyPhoto/trainingWindow'
import { LabProtocolSchema } from '@/schemas/labExam'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // Gemini Pro cruzando 4 fontes pode levar >30s

const BodySchema = z.object({ examId: z.string().uuid() }).strip()

const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

function extractJson(text: string): unknown {
  let cleaned = String(text || '').trim()
  if (!cleaned) return null
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m)
  if (fenceMatch?.[1]) cleaned = fenceMatch[1].trim()
  const direct = safeJsonParse(cleaned)
  if (direct) return direct
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  return safeJsonParse(cleaned.slice(start, end + 1))
}

const dayStr = (d: Date) => d.toISOString().slice(0, 10)

const PROMPT_HEADER = [
  'Você é uma equipe multidisciplinar (médico do esporte, nutricionista esportivo e educador físico)',
  'analisando os EXAMES LABORATORIAIS de um praticante de musculação, cruzando com a avaliação física',
  'e o treino REAL executado nos últimos ~90 dias.',
  '',
  'OBJETIVO: gerar um protocolo prático e integrado conectando os MARCADORES alterados às ações de',
  'treino, dieta e suplementação. Sempre justifique cada recomendação citando o marcador específico',
  '(ex.: "Vitamina D 18 ng/mL, abaixo de 30"). Priorize o que mais impacta saúde e performance.',
  '',
  'REGRAS CRÍTICAS:',
  '- Para marcadores muito alterados ou de risco (ex.: glicemia/HbA1c altas, função renal/hepática',
  '  alterada, hormônios muito fora), gere um item em "medicalAlerts" orientando procurar o médico.',
  '  NÃO tente "tratar" — encaminhe.',
  '- Suplementação: pode incluir dose, horário e duração, MAS apenas suplementos de venda livre e em',
  '  faixas seguras de bula. Marque otcAvailable corretamente. NUNCA recomende anabolizantes, hormônios,',
  '  ou medicamentos controlados — se um marcador sugerir isso, vire um medicalAlert encaminhando ao médico.',
  '- Seja concreto e cite números (do exame e do treino). Se faltar dado (sem treino, sem avaliação),',
  '  diga e baixe a confiança.',
  '- Responda em português do Brasil.',
  '',
  'NÃO inclua disclaimer no JSON — ele é adicionado pelo app.',
  '',
  'Responda APENAS com JSON puro no formato (sem markdown):',
  '{',
  '  "headline": "frase de impacto conectando exame e objetivo",',
  '  "overallAssessment": "avaliação geral 2-4 frases",',
  '  "medicalAlerts": [{ "marker": "...", "value": "...", "severity": "urgent|moderate|watch", "action": "..." }],',
  '  "trainingProtocol": { "summary": "...", "adjustments": [{ "area": "...", "recommendation": "...", "reason": "...", "priority": "high|medium|low" }] },',
  '  "nutritionProtocol": { "summary": "...", "adjustments": [{ "nutrient": "...", "recommendation": "...", "reason": "...", "priority": "high|medium|low" }], "foodSuggestions": ["..."] },',
  '  "supplementation": [{ "name": "...", "dose": "...", "timing": "...", "reason": "...", "duration": "...", "priority": "high|medium|low", "otcAvailable": true }],',
  '  "followUp": { "retestIn": "...", "markersToWatch": ["..."], "notes": "..." },',
  '  "confidence": "high|medium|low"',
  '}',
].join('\n')

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:lab-protocol:${userId}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkVipFeatureAccess(auth.supabase, userId, 'lab_exams')
    if (!access.allowed) return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { examId } = parsed.data!

    const apiKey = env.gemini.apiKey
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const admin = createAdminClient()

    const { data: exam } = await admin
      .from('lab_exams')
      .select('id, user_id, trainer_id, extracted_markers')
      .eq('id', examId)
      .maybeSingle()
    if (!exam) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    const assessedUserId = String((exam as { user_id?: string }).user_id || '')
    const trainerId = (exam as { trainer_id?: string | null }).trainer_id || null
    if (userId !== assessedUserId && userId !== trainerId) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const markers = (exam as { extracted_markers?: unknown }).extracted_markers
    if (!markers) {
      return NextResponse.json({ ok: false, error: 'no_markers', message: 'Extraia os marcadores do exame primeiro.' }, { status: 400 })
    }

    // ── Fonte 2: última avaliação física ────────────────────────────────────
    const { data: lastAssessment } = await admin
      .from('assessments')
      .select('assessment_date, weight, height, age, gender, body_fat_percentage, lean_mass, bmr, bia_body_fat_percentage, bia_lean_mass, bia_visceral_fat, bia_metabolic_age')
      .eq('user_id', assessedUserId)
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    // ── Fonte 3: laudo da avaliação por foto mais recente ───────────────────
    const { data: lastPhoto } = await admin
      .from('body_photo_assessments')
      .select('analysis, composition_score, symmetry_score, posture_score, proportion_score, body_fat_estimate_low, body_fat_estimate_high')
      .eq('user_id', assessedUserId)
      .eq('status', 'done')
      .order('assessment_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    // ── Fonte 4: janela de treino dos últimos 90 dias ───────────────────────
    const toDate = new Date()
    const fromDate = new Date(toDate.getTime() - 90 * 86400_000)
    const merged = new Map<string, { notes?: unknown }>()
    const collect = (rows: unknown) => {
      if (!Array.isArray(rows)) return
      for (const r of rows) {
        const row = r as { id?: string; notes?: unknown }
        if (row?.id) merged.set(String(row.id), { notes: row.notes })
      }
    }
    const { data: byCompleted } = await admin
      .from('workouts').select('id, notes, completed_at')
      .eq('user_id', assessedUserId).eq('is_template', false)
      .gte('completed_at', fromDate.toISOString()).lte('completed_at', toDate.toISOString())
    collect(byCompleted)
    const { data: byDate } = await admin
      .from('workouts').select('id, notes, date')
      .eq('user_id', assessedUserId).eq('is_template', false)
      .gte('date', dayStr(fromDate)).lte('date', dayStr(toDate))
    collect(byDate)
    const training = aggregateTrainingWindow([...merged.values()])

    const promptData = {
      exame: markers,
      avaliacaoFisica: lastAssessment || null,
      laudoFoto: lastPhoto
        ? {
            analysis: (lastPhoto as { analysis?: unknown }).analysis,
            scores: {
              composition: (lastPhoto as { composition_score?: number }).composition_score,
              symmetry: (lastPhoto as { symmetry_score?: number }).symmetry_score,
              posture: (lastPhoto as { posture_score?: number }).posture_score,
              proportion: (lastPhoto as { proportion_score?: number }).proportion_score,
            },
          }
        : null,
      treino90dias: {
        sessoes: training.sessions,
        volumeTotalKg: training.totalVolumeKg,
        seriesTotais: training.totalSets,
        topExercicios: training.topExercises,
      },
    }

    const prompt = `${PROMPT_HEADER}\n\nDADOS:\n${JSON.stringify(promptData)}`

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: env.gemini.modelId })
    const geminiResult = await safeGemini('lab-exam-protocol', () => model.generateContent(prompt))
    if ('errorResponse' in geminiResult) {
      await admin.from('lab_exams').update({ status: 'failed', error_message: 'ai_error' }).eq('id', examId)
      return geminiResult.errorResponse
    }

    const rawText = geminiResult.value?.response?.text?.() || ''
    const validated = LabProtocolSchema.safeParse(extractJson(rawText))
    if (!validated.success) {
      logError('ai:lab-exam-protocol:invalid', new Error('schema mismatch'), { rawPreview: String(rawText).slice(0, 300) })
      await admin.from('lab_exams').update({ status: 'failed', error_message: 'protocol_failed' }).eq('id', examId)
      return NextResponse.json({ ok: false, error: 'protocol_failed', message: 'Não consegui gerar o protocolo. Tente novamente.' }, { status: 422 })
    }

    await admin
      .from('lab_exams')
      .update({
        protocol: validated.data,
        status: 'done',
        ai_model: env.gemini.modelId,
        ai_analyzed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', examId)

    return NextResponse.json({ ok: true, data: validated.data })
  } catch (e) {
    logError('ai:lab-exam-protocol', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}

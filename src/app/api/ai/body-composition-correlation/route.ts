/**
 * API: POST /api/ai/body-composition-correlation
 *
 * O DIFERENCIAL da avaliação por foto: cruza o laudo da foto com o volume
 * REAL treinado na janela entre a avaliação anterior e a atual (ou 90 dias).
 * Como body_photo_assessments.user_id == workouts.user_id, dá pra explicar a
 * evolução do físico com base no que a pessoa de fato treinou.
 *
 * On-demand (sem persistência): cada chamada recomputa com os dados mais
 * recentes de treino. Acesso: dono (user_id) ou personal (trainer_id).
 * Rate limit: 5 req/min.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { logError } from '@/lib/logger'
import { aggregateTrainingWindow } from '@/utils/bodyPhoto/trainingWindow'
import { BodyPhotoCorrelationSchema, type TrainingWindowSummary } from '@/types/bodyPhotoAssessment'
import { buildUserContextBlock } from '@/utils/ai/userContext'

export const dynamic = 'force-dynamic'

const DEFAULT_LOOKBACK_DAYS = 90
const BodySchema = z.object({ assessmentId: z.string().uuid() }).strip()

const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())
function extractJson(text: string): unknown {
    let cleaned = String(text || '').trim()
    if (!cleaned) return null
    const fence = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m)
    if (fence?.[1]) cleaned = fence[1].trim()
    const direct = safeJsonParse(cleaned)
    if (direct) return direct
    const s = cleaned.indexOf('{')
    const e = cleaned.lastIndexOf('}')
    if (s === -1 || e <= s) return null
    return safeJsonParse(cleaned.slice(s, e + 1))
}

const dayStr = (d: Date) => d.toISOString().slice(0, 10)

export async function POST(req: Request) {
    try {
        const auth = await requireUser()
        if (!auth.ok) return auth.response
        const userId = String(auth.user.id || '').trim()

        const ip = getRequestIp(req)
        const rl = await checkRateLimitAsync(`ai:body-correlation:${userId}:${ip}`, 5, 60_000)
        if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

        const apiKey = env.gemini.apiKey
        if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

        const parsed = await parseJsonBody(req, BodySchema)
        if (parsed.response) return parsed.response
        const { assessmentId } = parsed.data!

        const admin = createAdminClient()

        // Avaliação atual + access check
        const { data: current, error: cErr } = await admin
            .from('body_photo_assessments')
            .select('id, user_id, trainer_id, assessment_date, analysis, composition_score, symmetry_score, posture_score, proportion_score, body_fat_estimate_low, body_fat_estimate_high')
            .eq('id', assessmentId)
            .maybeSingle()
        if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 400 })
        if (!current) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
        const cur = current as Record<string, unknown>
        const assessedUserId = String(cur.user_id || '')
        if (userId !== assessedUserId && userId !== (cur.trainer_id || null)) {
            return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }
        if (!cur.analysis) {
            return NextResponse.json({ ok: false, error: 'no_analysis', message: 'Gere o laudo da foto antes de correlacionar com o treino.' }, { status: 400 })
        }

        const thisDate = new Date(`${String(cur.assessment_date)}T00:00:00Z`)

        // Avaliação anterior (mesma pessoa) → define início da janela + delta
        const { data: prevRows } = await admin
            .from('body_photo_assessments')
            .select('id, assessment_date, composition_score, symmetry_score, posture_score, proportion_score, body_fat_estimate_low, body_fat_estimate_high')
            .eq('user_id', assessedUserId)
            .lt('assessment_date', String(cur.assessment_date))
            .order('assessment_date', { ascending: false })
            .limit(1)
        const previous = (prevRows && prevRows[0]) ? (prevRows[0] as Record<string, unknown>) : null

        const fromDate = previous
            ? new Date(`${String(previous.assessment_date)}T00:00:00Z`)
            : new Date(thisDate.getTime() - DEFAULT_LOOKBACK_DAYS * 86400_000)
        const toEnd = new Date(thisDate.getTime() + 86400_000 - 1)
        const fromIso = fromDate.toISOString()
        const toIso = toEnd.toISOString()

        // Sessões concluídas na janela (completed_at e fallback por date)
        const merged = new Map<string, { notes?: unknown }>()
        const collect = (rows: unknown) => {
            if (!Array.isArray(rows)) return
            for (const r of rows) {
                const row = r as { id?: string; notes?: unknown }
                if (row?.id) merged.set(String(row.id), { notes: row.notes })
            }
        }
        const { data: byCompleted } = await admin
            .from('workouts')
            .select('id, notes, completed_at')
            .eq('user_id', assessedUserId)
            .eq('is_template', false)
            .gte('completed_at', fromIso)
            .lte('completed_at', toIso)
        collect(byCompleted)
        const { data: byDate } = await admin
            .from('workouts')
            .select('id, notes, date')
            .eq('user_id', assessedUserId)
            .eq('is_template', false)
            .gte('date', dayStr(fromDate))
            .lte('date', dayStr(thisDate))
        collect(byDate)

        const stats = aggregateTrainingWindow([...merged.values()])
        const window: TrainingWindowSummary = {
            fromIso,
            toIso,
            hasPreviousAssessment: !!previous,
            sessions: stats.sessions,
            totalVolumeKg: stats.totalVolumeKg,
            totalSets: stats.totalSets,
            topExercises: stats.topExercises,
        }

        const promptData = {
            laudoAtual: cur.analysis,
            scoresAtuais: {
                composition: cur.composition_score, symmetry: cur.symmetry_score,
                posture: cur.posture_score, proportion: cur.proportion_score,
                bodyFat: [cur.body_fat_estimate_low, cur.body_fat_estimate_high],
            },
            avaliacaoAnterior: previous
                ? {
                    scores: {
                        composition: previous.composition_score, symmetry: previous.symmetry_score,
                        posture: previous.posture_score, proportion: previous.proportion_score,
                        bodyFat: [previous.body_fat_estimate_low, previous.body_fat_estimate_high],
                    },
                }
                : null,
            treinoNaJanela: {
                dias: Math.round((toEnd.getTime() - fromDate.getTime()) / 86400_000),
                sessoes: stats.sessions,
                volumeTotalKg: stats.totalVolumeKg,
                seriesTotais: stats.totalSets,
                topExercicios: stats.topExercises,
            },
        }

        const userCtx = await buildUserContextBlock(admin, assessedUserId, ['profile', 'nutrition', 'labs'])

        const prompt = [
            ...(userCtx ? [userCtx, ''] : []),
            'Você é um educador físico. Correlacione o LAUDO da avaliação por foto com o TREINO REAL executado na janela.',
            'Personalize pelo CONTEXTO DO USUÁRIO acima (objetivo, avaliação, exames, treino, nutrição).',
            'Use seu conhecimento de quais músculos cada exercício trabalha (pelos nomes em topExercicios).',
            'Seja concreto e cite números do treino (volume, séries, sessões). Se houver avaliação anterior, comente a evolução dos scores.',
            'Se não houver treino registrado na janela, diga isso com clareza e baixe a confiança.',
            '',
            'Retorne APENAS JSON puro:',
            '{',
            '  "headline": "frase de impacto citando treino e físico",',
            '  "narrative": "explicação correlacionando treino executado e físico observado",',
            '  "whatIsWorking": ["o que o treino está sustentando no físico"],',
            '  "whatIsMissing": ["lacunas: grupos pouco treinados vs. pontos fracos do laudo"],',
            '  "links": [{ "muscleGroup": "Peitoral", "observation": "texto citando volume", "trend": "supported|undertrained|overtrained|neutral" }],',
            '  "nextFocus": [{ "focus": "grupo/área", "action": "ajuste concreto de treino" }],',
            '  "confidence": "high|medium|low"',
            '}',
            '',
            'DADOS:',
            JSON.stringify(promptData),
        ].join('\n')

        const model = getGeminiModel(apiKey, env.gemini.modelId)
        const geminiResult = await safeGemini('body-composition-correlation', () => model.generateContent(prompt))
        if ('errorResponse' in geminiResult) return geminiResult.errorResponse

        const rawText = geminiResult.value?.response?.text?.() || ''
        const validated = BodyPhotoCorrelationSchema.safeParse(extractJson(rawText))
        if (!validated.success) {
            logError('ai:body-composition-correlation:invalid', new Error('schema mismatch'), { rawPreview: String(rawText).slice(0, 200) })
            return NextResponse.json({ ok: false, error: 'correlation_failed', message: 'Não consegui gerar a correlação. Tente novamente.' }, { status: 422 })
        }

        return NextResponse.json({ ok: true, correlation: validated.data, window })
    } catch (e) {
        logError('ai:body-composition-correlation', e)
        return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
    }
}

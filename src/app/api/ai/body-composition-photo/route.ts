/**
 * API: POST /api/ai/body-composition-photo
 *
 * O coração da Avaliação Física por Foto. Recebe assessmentId, baixa as fotos
 * (frente/perfil/costas) do bucket PRIVADO body-photos e gera um laudo
 * estruturado de composição corporal via Gemini Vision: faixa de % gordura,
 * scores 0–100 (composição/simetria/postura/proporção), avaliação por grupo
 * muscular, postura, simetria L/R, proporções e recomendações priorizadas.
 *
 * Acesso: dono (user_id) OU personal (trainer_id). Admin client + checagem.
 * Modelo: Pro (qualidade do laudo importa; não é OCR simples).
 * Rate limit: 5 req/min (chamada de IA cara).
 */
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI, type Part } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { env } from '@/utils/env'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { logError } from '@/lib/logger'
import { BodyPhotoLaudoSchema, POSE_LABELS_PT, type BodyPhotoPose } from '@/types/bodyPhotoAssessment'

export const dynamic = 'force-dynamic'

const BUCKET = 'body-photos'
const POSE_ORDER: BodyPhotoPose[] = ['front', 'side', 'back']

const BodySchema = z.object({ assessmentId: z.string().uuid() }).strip()

const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

function extractJson(text: string): unknown {
    let cleaned = String(text || '').trim()
    if (!cleaned) return null
    const fence = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m)
    if (fence?.[1]) cleaned = fence[1].trim()
    const direct = safeJsonParse(cleaned)
    if (direct) return direct
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    return safeJsonParse(cleaned.slice(start, end + 1))
}

const PROMPT = [
    'Você é um educador físico especialista em avaliação física e biomecânica.',
    'Recebe de 1 a 3 fotos padronizadas do MESMO indivíduo (frente, perfil, costas).',
    'Produza uma análise visual profissional de composição corporal e estrutura.',
    '',
    'IMPORTANTE — limites e ética:',
    '- É uma ESTIMATIVA visual, não diagnóstico médico nem laboratorial.',
    '- % de gordura SEMPRE como FAIXA (ex.: 14–17%), nunca número exato falso.',
    '- Se a foto não permitir avaliar algo, seja conservador e baixe a confiança.',
    '- Linguagem técnica mas acessível, em português-BR, tom de personal trainer.',
    '',
    'AVALIE:',
    '- bodyFatRange: faixa de % de gordura (low/high).',
    '- somatotype: somatotipo aparente (ectomorfo/mesomorfo/endomorfo ou misto) ou null.',
    '- apparentPhase: bulking | cutting | recomp | maintenance | unknown.',
    '- scores (0–100): composition (composição), symmetry (simetria L/R),',
    '  posture (postura), proportion (proporções/V-taper).',
    '- muscleGroups: lista por grupo (Peitoral, Ombros, Costas, Bíceps, Tríceps,',
    '  Abdômen, Quadríceps, Posterior, Glúteos, Panturrilhas) com development',
    '  (weak|moderate|good|excellent) e note curta.',
    '- posture: summary + findings (ex.: "leve anteriorização de ombros").',
    '- symmetry: summary + imbalances (assimetrias L vs R observáveis).',
    '- proportions: summary + shoulderToWaist (descritivo) ou null.',
    '- strengths, improvements: listas curtas.',
    '- recommendations: foco + ação concreta + priority (high|medium|low).',
    '- summary: resumo executivo 2–4 frases.',
    '- confidence: high|medium|low conforme a qualidade/ângulo das fotos.',
    '',
    'RESPONDA APENAS JSON PURO (sem markdown, sem texto fora do JSON):',
    '{',
    '  "bodyFatRange": { "low": número, "high": número },',
    '  "somatotype": texto|null,',
    '  "apparentPhase": "bulking"|"cutting"|"recomp"|"maintenance"|"unknown",',
    '  "scores": { "composition": número, "symmetry": número, "posture": número, "proportion": número },',
    '  "muscleGroups": [{ "group": texto, "development": "weak"|"moderate"|"good"|"excellent", "note": texto }],',
    '  "posture": { "summary": texto, "findings": [texto] },',
    '  "symmetry": { "summary": texto, "imbalances": [texto] },',
    '  "proportions": { "summary": texto, "shoulderToWaist": texto|null },',
    '  "strengths": [texto], "improvements": [texto],',
    '  "recommendations": [{ "focus": texto, "action": texto, "priority": "high"|"medium"|"low" }],',
    '  "summary": texto, "confidence": "high"|"medium"|"low"',
    '}',
].join('\n')

export async function POST(req: Request) {
    try {
        const auth = await requireUser()
        if (!auth.ok) return auth.response
        const userId = String(auth.user.id || '').trim()

        const ip = getRequestIp(req)
        const rl = await checkRateLimitAsync(`ai:body-photo:${userId}:${ip}`, 5, 60_000)
        if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

        const apiKey = env.gemini.apiKey
        if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

        const parsed = await parseJsonBody(req, BodySchema)
        if (parsed.response) return parsed.response
        const { assessmentId } = parsed.data!

        const admin = createAdminClient()

        // Access check
        const { data: assessment, error: aErr } = await admin
            .from('body_photo_assessments')
            .select('id, user_id, trainer_id')
            .eq('id', assessmentId)
            .maybeSingle()
        if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 400 })
        if (!assessment) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
        const a = assessment as { user_id: string; trainer_id: string | null }
        if (userId !== a.user_id && userId !== a.trainer_id) {
            return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
        }

        // Carrega fotos
        const { data: photosRaw } = await admin
            .from('body_photo_assessment_photos')
            .select('pose, storage_path')
            .eq('assessment_id', assessmentId)
        const photos = (photosRaw || []) as Array<{ pose: BodyPhotoPose; storage_path: string }>
        if (photos.length === 0) {
            return NextResponse.json({ ok: false, error: 'no_photos' }, { status: 400 })
        }

        // marca analisando
        await admin.from('body_photo_assessments').update({ status: 'analyzing' }).eq('id', assessmentId)

        // Baixa cada foto do bucket privado e monta partes multimodais (ordenadas)
        const ordered = [...photos].sort((x, y) => POSE_ORDER.indexOf(x.pose) - POSE_ORDER.indexOf(y.pose))
        const parts: Part[] = [{ text: PROMPT }]
        for (const ph of ordered) {
            const { data: blob, error: dErr } = await admin.storage.from(BUCKET).download(ph.storage_path)
            if (dErr || !blob) continue
            const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
            parts.push({ text: `\nFOTO ${POSE_LABELS_PT[ph.pose].toUpperCase()}:` })
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } })
        }
        if (parts.length <= 1) {
            await admin.from('body_photo_assessments').update({ status: 'failed' }).eq('id', assessmentId)
            return NextResponse.json({ ok: false, error: 'photos_unreadable' }, { status: 400 })
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: env.gemini.modelId })
        const geminiResult = await safeGemini('body-composition-photo', () => model.generateContent(parts))
        if ('errorResponse' in geminiResult) {
            await admin.from('body_photo_assessments').update({ status: 'failed' }).eq('id', assessmentId)
            return geminiResult.errorResponse
        }

        const rawText = geminiResult.value?.response?.text?.() || ''
        const extracted = extractJson(rawText)
        const validated = BodyPhotoLaudoSchema.safeParse(extracted)
        if (!validated.success) {
            logError('ai:body-composition-photo:invalid', new Error('schema mismatch'), { rawPreview: String(rawText).slice(0, 200) })
            await admin.from('body_photo_assessments').update({ status: 'failed' }).eq('id', assessmentId)
            return NextResponse.json(
                { ok: false, error: 'analysis_failed', message: 'Não consegui analisar as fotos. Confira se aparecem o corpo inteiro com boa luz e tente de novo.' },
                { status: 422 },
            )
        }

        const laudo = validated.data
        const { error: saveErr } = await admin
            .from('body_photo_assessments')
            .update({
                analysis: laudo,
                composition_score: laudo.scores.composition,
                symmetry_score: laudo.scores.symmetry,
                posture_score: laudo.scores.posture,
                proportion_score: laudo.scores.proportion,
                body_fat_estimate_low: laudo.bodyFatRange.low,
                body_fat_estimate_high: laudo.bodyFatRange.high,
                ai_model: env.gemini.modelId,
                ai_analyzed_at: new Date().toISOString(),
                status: 'done',
            })
            .eq('id', assessmentId)
        if (saveErr) return NextResponse.json({ ok: false, error: saveErr.message }, { status: 400 })

        return NextResponse.json({ ok: true, analysis: laudo })
    } catch (e) {
        logError('ai:body-composition-photo', e)
        return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
    }
}

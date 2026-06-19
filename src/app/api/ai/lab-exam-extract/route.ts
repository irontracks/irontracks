/**
 * API: POST /api/ai/lab-exam-extract
 *
 * Lê os arquivos (PDF/foto) de um exame laboratorial do bucket PRIVADO
 * lab-exams e extrai os marcadores com o Gemini Flash. Salva em
 * lab_exams.extracted_markers e avança o status pra 'analyzing'.
 *
 * Diferente do bia-extract (bucket público via URL): aqui baixamos via admin
 * client porque o bucket é privado — exame médico nunca é exposto publicamente.
 *
 * Feature VIP (pro+). Rate limit: 5 req/min por usuário (IA é cara).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkVipFeatureAccess } from '@/utils/vip/limits'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { logError } from '@/lib/logger'
import { LabExamExtractedSchema, LAB_MARKER_CATEGORIES, LAB_MARKER_STATUSES } from '@/schemas/labExam'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // PDF grande + Gemini Flash pode levar >30s

const BUCKET = 'lab-exams'
const MAX_FILE_BYTES = 20 * 1024 * 1024

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

const PROMPT = [
  'Você é um especialista em interpretar EXAMES LABORATORIAIS de sangue/urina (laudos clínicos).',
  'Os arquivos anexados são resultados de exames (podem ser vários PDFs/fotos do mesmo pacote).',
  '',
  'TAREFA: extrair TODOS os marcadores presentes, com valor, unidade e faixa de referência.',
  'Cubra (quando presentes): hemograma; perfil lipídico (colesterol total, LDL, HDL, VLDL,',
  'triglicerídeos); glicemia, HbA1c, insulina, HOMA-IR; hormônios (testosterona total e livre,',
  'estradiol, cortisol, DHEA-S, LH, FSH, prolactina, GH, IGF-1); tireoide (TSH, T3 livre, T4 livre);',
  'vitaminas e minerais (vitamina D 25-OH, B12, ácido fólico, ferro, ferritina, transferrina, zinco,',
  'magnésio, cálcio); função renal (creatinina, ureia, ácido úrico, TFG); função hepática (TGO/AST,',
  'TGP/ALT, GGT, fosfatase alcalina, bilirrubinas); inflamatórios (PCR, VHS); eletrólitos (sódio,',
  'potássio, fósforo).',
  '',
  'Para cada marcador, determine o "status" comparando o valor com a faixa de referência IMPRESSA no',
  'laudo (refMin/refMax). Regras:',
  '- "normal": dentro da faixa.',
  '- "low": abaixo de refMin. "high": acima de refMax.',
  '- "critical_low"/"critical_high": muito fora (≳ 30% além do limite) ou marcado como crítico/alerta.',
  '- Se não houver faixa impressa, use seu conhecimento clínico de referência adulto, mas preencha',
  '  refMin/refMax com null.',
  '',
  `Categorias válidas (use exatamente uma): ${LAB_MARKER_CATEGORIES.join(', ')}.`,
  `Status válidos: ${LAB_MARKER_STATUSES.join(', ')}.`,
  '',
  'REGRAS GERAIS:',
  '- Ponto como separador decimal, nunca vírgula.',
  '- Se não der pra ler um valor com certeza → value: null (não chute o número), mas mantenha o nome.',
  '- examDate: data de coleta no formato yyyy-mm-dd, se legível.',
  '- Se os arquivos NÃO forem exames laboratoriais → markers: [] e confidence: "low".',
  '- NÃO invente marcadores que não estão no documento.',
  '',
  'RESPONDA APENAS COM JSON PURO (sem markdown):',
  '{',
  '  "examTypes": ["Hemograma", "Perfil lipídico", ...],',
  '  "markers": [',
  '    { "name": "Testosterona Total", "value": 520, "unit": "ng/dL", "refMin": 250, "refMax": 1100, "status": "normal", "category": "Hormônios" }',
  '  ],',
  '  "examDate": "yyyy-mm-dd" | null,',
  '  "labName": "string" | null,',
  '  "notes": "observações do laudo" | null,',
  '  "confidence": "high" | "medium" | "low"',
  '}',
].join('\n')

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:lab-extract:${userId}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const access = await checkVipFeatureAccess(auth.supabase, userId, 'lab_exams')
    if (!access.allowed) return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { examId } = parsed.data!

    const apiKey = env.gemini.apiKey
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const admin = createAdminClient()

    // Access check
    const { data: exam } = await admin
      .from('lab_exams')
      .select('id, user_id, trainer_id')
      .eq('id', examId)
      .maybeSingle()
    if (!exam) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    const assessedUserId = String((exam as { user_id?: string }).user_id || '')
    const trainerId = (exam as { trainer_id?: string | null }).trainer_id || null
    if (userId !== assessedUserId && userId !== trainerId) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // Arquivos do exame
    const { data: files } = await admin
      .from('lab_exam_files')
      .select('storage_path, mime_type')
      .eq('exam_id', examId)
    const fileRows = (files || []) as Array<{ storage_path?: string; mime_type?: string }>
    if (fileRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_files' }, { status: 400 })
    }

    await admin.from('lab_exams').update({ status: 'extracting' }).eq('id', examId)

    // Baixa cada arquivo do bucket privado e monta as parts pro Gemini.
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: PROMPT }]
    for (const f of fileRows) {
      const path = String(f.storage_path || '')
      if (!path) continue
      const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(path)
      if (dlErr || !blob) {
        logError('ai:lab-extract:download', dlErr || new Error('no blob'), { path })
        continue
      }
      const buf = Buffer.from(await blob.arrayBuffer())
      if (buf.length > MAX_FILE_BYTES) continue
      parts.push({ inlineData: { mimeType: String(f.mime_type || 'application/pdf'), data: buf.toString('base64') } })
    }
    if (parts.length < 2) {
      await admin.from('lab_exams').update({ status: 'failed', error_message: 'download_failed' }).eq('id', examId)
      return NextResponse.json({ ok: false, error: 'download_failed' }, { status: 400 })
    }

    const model = getGeminiModel(apiKey, env.gemini.fastModelId)
    const geminiResult = await safeGemini('lab-exam-extract', () => model.generateContent(parts))
    if ('errorResponse' in geminiResult) {
      await admin.from('lab_exams').update({ status: 'failed', error_message: 'ai_error' }).eq('id', examId)
      return geminiResult.errorResponse
    }

    const rawText = geminiResult.value?.response?.text?.() || ''
    const validated = LabExamExtractedSchema.safeParse(extractJson(rawText))
    if (!validated.success) {
      logError('ai:lab-exam-extract:invalid', new Error('schema mismatch'), { rawPreview: String(rawText).slice(0, 200) })
      await admin.from('lab_exams').update({ status: 'failed', error_message: 'extraction_failed' }).eq('id', examId)
      return NextResponse.json(
        { ok: false, error: 'extraction_failed', message: 'Não consegui ler esse documento. Confira se é um exame laboratorial legível e tente de novo.' },
        { status: 422 },
      )
    }

    await admin
      .from('lab_exams')
      .update({
        extracted_markers: validated.data,
        exam_date: validated.data.examDate || (exam as { exam_date?: string }).exam_date || null,
        lab_name: validated.data.labName || null,
        status: 'analyzing',
        ai_model: env.gemini.fastModelId,
      })
      .eq('id', examId)

    return NextResponse.json({ ok: true, data: validated.data })
  } catch (e) {
    logError('ai:lab-exam-extract', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}

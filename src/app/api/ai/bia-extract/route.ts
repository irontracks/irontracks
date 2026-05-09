/**
 * API: POST /api/ai/bia-extract
 *
 * Recebe a URL pública do arquivo de bioimpedância (PDF/foto já no
 * Storage do bucket bioimpedance-files) e usa o Gemini para extrair os
 * 6 campos numéricos. Retorna JSON estruturado para o frontend
 * pré-preencher o formulário.
 *
 * Estratégia
 * ──────────
 * - Recebemos URL em vez de multipart porque o arquivo já foi enviado
 *   uma vez (signed-upload). Re-uploadar o mesmo arquivo desperdiça
 *   bandwidth e é mais lento.
 * - Limit de download server-side: 16 MB (1 MB acima do limite de upload
 *   pra cobrir variações de bucket).
 * - Ouve TODOS os campos como nullable: o aparelho pode não ter algum
 *   (ex: água em modelos baratos). Frontend trata null como "não
 *   preenchido" e deixa o campo vazio.
 *
 * Rate limit: 5 req/min por usuário (chamada de IA é cara).
 */
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { env } from '@/utils/env'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const MAX_DOWNLOAD_BYTES = 16 * 1024 * 1024 // 16 MB
const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

const BodySchema = z
  .object({
    /** URL pública do bucket bioimpedance-files (mesma que foi salva
     *  em assessments.bia_attachment_url). */
    url: z.string().url().min(1),
  })
  .strip()

/**
 * Schema do retorno do Gemini. Tudo nullable porque o documento pode não
 * ter o campo, ou a IA pode não ter conseguido extrair com confiança.
 * Ranges fisiológicos amplos pra não rejeitar valores extremos legítimos.
 */
const ExtractionSchema = z.object({
  body_fat_percentage: z.number().min(0).max(100).nullable(),
  lean_mass_kg: z.number().min(5).max(250).nullable(),
  fat_mass_kg: z.number().min(0).max(250).nullable(),
  water_percentage: z.number().min(0).max(100).nullable(),
  visceral_fat: z.number().min(0).max(60).nullable(),
  metabolic_age_years: z.number().min(10).max(120).nullable(),
  /** Confiança da extração — frontend pode usar pra avisar ao usuário. */
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
})

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

/**
 * Baixa o arquivo da URL pública. Aceitamos qualquer host porque a URL
 * vem do Storage do Supabase (controlado por nós) — o bucket é público
 * para esses arquivos especificamente. Limit de tamanho previne abuso
 * caso alguém modifique manualmente o registro no banco.
 */
async function downloadAttachment(url: string): Promise<{ ok: true; data: Buffer; mime: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return { ok: false, error: `download_failed_${res.status}` }
    const contentType = (res.headers.get('content-type') || '').toLowerCase().split(';')[0].trim()
    if (!ALLOWED_MIMES.includes(contentType)) {
      return { ok: false, error: `unsupported_mime_${contentType || 'unknown'}` }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > MAX_DOWNLOAD_BYTES) return { ok: false, error: 'file_too_large' }
    return { ok: true, data: buf, mime: contentType }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'download_error' }
  }
}

const PROMPT = [
  'Você é um especialista em ler resultados de avaliações de BIOIMPEDÂNCIA (BIA).',
  'O documento anexado é o relatório de uma máquina de bioimpedância (Inbody, Omron, Tanita, balança smart, etc).',
  '',
  'TAREFA: Extrair os valores numéricos dos seguintes campos:',
  '- body_fat_percentage: % de gordura corporal (0-100). Procure por "Gordura", "Body Fat", "% Gordura", "BF%", "PBF".',
  '- lean_mass_kg: massa magra/livre de gordura em kg. Procure por "Massa Magra", "Lean Mass", "FFM", "Massa Livre de Gordura".',
  '- fat_mass_kg: massa gorda em kg. Procure por "Massa Gorda", "Fat Mass", "MM Gorda".',
  '- water_percentage: % de água corporal (0-100). Procure por "Água", "Water", "Body Water", "BWP", "TBW%".',
  '- visceral_fat: índice de gordura visceral. Procure por "Visceral Fat", "Gordura Visceral", "VFL", "VFA".',
  '- metabolic_age_years: idade metabólica em anos. Procure por "Idade Metabólica", "Metabolic Age".',
  '',
  'REGRAS:',
  '- Se o campo NÃO está visível ou não é possível ler com certeza → retorne null.',
  '- NÃO invente valores. Melhor null do que errado.',
  '- Se o documento não parece ser uma BIA → todos null + confidence: "low".',
  '- Use ponto como separador decimal (não vírgula).',
  '- confidence: "high" se conseguiu ler todos com clareza, "medium" se alguns ficaram dubidosos, "low" se quase nada.',
  '',
  'RESPONDA APENAS COM JSON PURO, sem texto explicativo, sem markdown:',
  '{',
  '  "body_fat_percentage": número | null,',
  '  "lean_mass_kg": número | null,',
  '  "fat_mass_kg": número | null,',
  '  "water_percentage": número | null,',
  '  "visceral_fat": número | null,',
  '  "metabolic_age_years": número | null,',
  '  "confidence": "high" | "medium" | "low"',
  '}',
].join('\n')

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:bia-extract:${userId}:${ip}`, 5, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { url } = parsed.data!

    // Sanity: a URL precisa apontar para o nosso bucket. Não validamos
    // o host estrito (proxies de CDN podem reescrever) mas o path tem
    // que conter '/bioimpedance-files/' como camada extra de defesa.
    if (!url.includes('/bioimpedance-files/')) {
      return NextResponse.json({ ok: false, error: 'invalid_attachment_url' }, { status: 400 })
    }

    const apiKey = env.gemini.apiKey
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const dl = await downloadAttachment(url)
    if (!dl.ok) {
      return NextResponse.json({ ok: false, error: dl.error }, { status: 400 })
    }

    const base64Data = dl.data.toString('base64')

    const genAI = new GoogleGenerativeAI(apiKey)
    // Flash é suficiente pra OCR estruturado e custa muito menos que Pro.
    const model = genAI.getGenerativeModel({ model: env.gemini.fastModelId })

    const geminiResult = await safeGemini('bia-extract', () =>
      model.generateContent([
        { text: PROMPT },
        { inlineData: { mimeType: dl.mime, data: base64Data } },
      ]),
    )
    if ('errorResponse' in geminiResult) return geminiResult.errorResponse
    const result = geminiResult.value

    const rawText = result?.response?.text?.() || ''
    const extracted = extractJson(rawText)
    const validated = ExtractionSchema.safeParse(extracted)

    if (!validated.success) {
      logError('ai:bia-extract:invalid_response', new Error('Gemini response did not match schema'), {
        rawPreview: String(rawText).slice(0, 200),
      })
      return NextResponse.json(
        {
          ok: false,
          error: 'extraction_failed',
          message: 'Não consegui ler os dados desse documento. Confere se é um relatório de bioimpedância e tenta de novo, ou preencha manualmente.',
        },
        { status: 422 },
      )
    }

    return NextResponse.json({
      ok: true,
      data: validated.data,
    })
  } catch (e) {
    logError('ai:bia-extract', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}

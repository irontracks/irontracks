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
import { z } from 'zod'
import { isSafeStoragePath, requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody, parseJsonWithSchema } from '@/utils/zod'
import { env } from '@/utils/env'
import { getGeminiModel } from '@/utils/ai/gemini'
import { safeGemini } from '@/utils/ai/handleGeminiError'
import { logError } from '@/lib/logger'
import { BIA_BUCKET, canAccessBiaPath } from '@/utils/storage/biaAttachmentAccess'

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
    /** Path no bucket PRIVADO bioimpedance-files: `{uid}/bia/{arquivo}`
     *  (mesmo valor salvo em assessments.bia_attachment_url). */
    path: z.string().min(1),
  })
  .strip()

/**
 * Schema do retorno do Gemini. Tudo nullable porque o documento pode não
 * ter o campo, ou a IA pode não ter conseguido extrair com confiança.
 * Ranges fisiológicos amplos pra não rejeitar valores extremos legítimos.
 *
 * Cobertura por aparelho típico:
 * - InBody (mais comum em academias BR): tem TODOS os campos abaixo
 * - Tanita: peso, altura, %BF, massa magra, massa gorda, água %, idade
 *   metabólica, gordura visceral
 * - Omron HBF (residencial): peso, %BF, massa magra/gorda, idade
 *   metabólica, BMR
 * - Balanças smart (Renpho/Mi): peso, %BF, massa magra/gorda, água, BMR
 */
const ExtractionSchema = z.object({
  // Antropometria — quando o aparelho mede / aluno informou
  weight_kg: z.number().min(20).max(400).nullable(),
  height_cm: z.number().min(80).max(250).nullable(),
  age_years: z.number().min(10).max(120).nullable(),
  // Composição corporal
  body_fat_percentage: z.number().min(0).max(100).nullable(),
  lean_mass_kg: z.number().min(5).max(250).nullable(),
  fat_mass_kg: z.number().min(0).max(250).nullable(),
  water_percentage: z.number().min(0).max(100).nullable(),
  visceral_fat: z.number().min(0).max(60).nullable(),
  // Metabolismo
  metabolic_age_years: z.number().min(10).max(120).nullable(),
  bmr_kcal: z.number().min(500).max(5000).nullable(),
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
 * Infere o mime pelo sufixo do path quando o Storage não retorna content-type.
 * O download agora é feito via SDK do Storage (path no bucket privado), então
 * NÃO há mais fetch de URL externa — a superfície de SSRF foi eliminada.
 */
function inferMimeFromPath(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic') return 'image/heic'
  if (ext === 'heif') return 'image/heif'
  return ''
}

const PROMPT = [
  'Você é um especialista em ler relatórios de BIOIMPEDÂNCIA (BIA).',
  'O documento anexado é o resultado de uma máquina (InBody, Tanita, Omron, balança smart Renpho/Mi, etc).',
  '',
  'TAREFA: Extrair os valores numéricos dos campos abaixo. Aparelhos diferentes usam nomes',
  'diferentes — busque variações em PT-BR e EN:',
  '',
  '🔢 ANTROPOMETRIA',
  '- weight_kg: peso corporal em kg. Procure por "Peso", "Weight", "kg" (valor único, não escala).',
  '  ATENÇÃO: NÃO confunda com "Peso Ideal" ou "Controle de Peso" — pegue o peso ATUAL medido.',
  '- height_cm: altura em centímetros. Procure por "Altura", "Height", "cm".',
  '- age_years: idade do avaliado em anos. Procure por "Idade", "Age".',
  '',
  '💪 COMPOSIÇÃO CORPORAL',
  '- body_fat_percentage: % de gordura corporal (0-100). Procure por:',
  '  "% Gordura", "Body Fat", "PGC", "BF%", "PBF", "Percentual de Gordura".',
  '  ATENÇÃO em InBody: o relatório mostra valores em barras com escala numérica',
  '  (ex: "12 15 19 22 25 28 32 35 38" são marcadores da escala, NÃO o valor real).',
  '  O valor real geralmente aparece em destaque/negrito (ex: "17" ou "32.90").',
  '  Se houver dois valores plausíveis, escolha o que faz sentido com o peso e massa gorda.',
  '- lean_mass_kg: massa magra LIVRE DE GORDURA em kg. Procure por:',
  '  "Massa Magra", "Lean Mass", "FFM", "Massa Livre de Gordura".',
  '  Se o aparelho mostrar "Massa Esquelética Muscular" / "Skeletal Muscle Mass" e NÃO houver',
  '  outra massa magra, use esse valor.',
  '- fat_mass_kg: massa gorda em kg. Procure por "Massa de Gordura", "Massa Gorda", "Fat Mass".',
  '- water_percentage: % de água corporal (0-100). Procure por "Água %", "BWP", "TBW%".',
  '  IMPORTANTE: se o aparelho der água em LITROS (ex: "Água Corporal Total 59.3 L") e tiver',
  '  o peso, calcule: water_percentage = (água_litros / peso_kg) × 100. Se não tiver peso, null.',
  '- visceral_fat: índice de gordura visceral. Procure por "Visceral", "VFL", "VFA",',
  '  "Nível de Gordura Visceral".',
  '',
  '⚡ METABOLISMO',
  '- metabolic_age_years: idade metabólica em anos. Procure por "Idade Metabólica", "Metabolic Age".',
  '  NÃO confunda com a idade real (age_years).',
  '- bmr_kcal: taxa metabólica basal em kcal/dia. Procure por:',
  '  "TMB", "Taxa Metabólica Basal", "BMR", "Basal Metabolic Rate".',
  '',
  'REGRAS GERAIS:',
  '- Se o campo NÃO está visível ou não dá pra ler com certeza → retorne null. NÃO chute.',
  '- Use ponto como separador decimal, nunca vírgula.',
  '- Se o documento não for uma BIA → todos null + confidence: "low".',
  '- confidence: "high" se leu tudo claro, "medium" se alguns ficaram duvidosos, "low" se quase nada.',
  '',
  'RESPONDA APENAS COM JSON PURO, sem texto explicativo, sem markdown:',
  '{',
  '  "weight_kg": número | null,',
  '  "height_cm": número | null,',
  '  "age_years": número | null,',
  '  "body_fat_percentage": número | null,',
  '  "lean_mass_kg": número | null,',
  '  "fat_mass_kg": número | null,',
  '  "water_percentage": número | null,',
  '  "visceral_fat": número | null,',
  '  "metabolic_age_years": número | null,',
  '  "bmr_kcal": número | null,',
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
    const { path } = parsed.data!

    // Path do bucket PRIVADO. Download via SDK do Storage — sem fetch de URL
    // externa, logo sem superfície de SSRF (auditoria 2026-06-27 M2/M5).
    const safe = isSafeStoragePath(path)
    if (!safe.ok) return NextResponse.json({ ok: false, error: safe.error }, { status: 400 })
    if (!(await canAccessBiaPath({ id: userId, email: auth.user.email }, safe.path))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const apiKey = env.gemini.apiKey
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const admin = createAdminClient()
    const dl = await admin.storage.from(BIA_BUCKET).download(safe.path)
    if (dl.error || !dl.data) {
      return NextResponse.json({ ok: false, error: 'download_failed' }, { status: 400 })
    }
    const blob = dl.data
    const mime = (blob.type || '').toLowerCase().split(';')[0].trim() || inferMimeFromPath(safe.path)
    if (!ALLOWED_MIMES.includes(mime)) {
      return NextResponse.json({ ok: false, error: `unsupported_mime_${mime || 'unknown'}` }, { status: 400 })
    }
    const arrayBuf = await blob.arrayBuffer()
    if (arrayBuf.byteLength > MAX_DOWNLOAD_BYTES) {
      return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 })
    }
    const base64Data = Buffer.from(arrayBuf).toString('base64')

    // Flash é suficiente pra OCR estruturado e custa muito menos que Pro.
    const model = getGeminiModel(apiKey, env.gemini.fastModelId)

    const geminiResult = await safeGemini('bia-extract', () =>
      model.generateContent([
        { text: PROMPT },
        { inlineData: { mimeType: mime, data: base64Data } },
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

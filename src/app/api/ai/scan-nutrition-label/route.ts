/**
 * API: POST /api/ai/scan-nutrition-label
 *
 * Receives a photo of a nutritional label (multipart/form-data).
 * Uses Gemini Vision to extract macros per 100g.
 * Returns extracted data for user confirmation — does NOT save to DB (that's done client-side).
 *
 * Rate limit: 10 req/hour per user.
 */
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonWithSchema } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const MODEL = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.5-flash'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

const LabelSchema = z.object({
  productName: z.string().min(1).max(120).default('Produto'),
  servingSizeG: z.number().nonnegative().default(100),
  kcalPer100g: z.number().nonnegative(),
  proteinPer100g: z.number().nonnegative(),
  carbsPer100g: z.number().nonnegative(),
  fatPer100g: z.number().nonnegative(),
  fiberPer100g: z.number().nonnegative().default(0),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
})

// Require at least kcal to be present and non-zero
const isUsable = (d: z.infer<typeof LabelSchema>) => d.kcalPer100g > 0

const safeJsonParse = (raw: unknown) => parseJsonWithSchema(raw, z.unknown())

function extractJson(text: string) {
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

/** Resolve MIME type from File — mobile browsers sometimes leave type empty */
function resolveMime(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const ext = (file.name || '').split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif',
  }
  return map[ext ?? ''] || 'image/jpeg'
}

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`ai:scan-label:${userId}:${ip}`, 10, 3_600_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const formData = await req.formData()
    const file = formData.get('photo') as File | null

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'no_photo' }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, error: 'photo_too_large' }, { status: 400 })
    }

    const mimeType = resolveMime(file)
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    if (!validMimes.includes(mimeType)) {
      return NextResponse.json({ ok: false, error: 'invalid_image_type' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) return NextResponse.json({ ok: false, error: 'ai_not_configured' }, { status: 500 })

    const arrayBuffer = await file.arrayBuffer()
    const base64Data = Buffer.from(arrayBuffer).toString('base64')

    const prompt = [
      'Você é um especialista em leitura de rótulos nutricionais brasileiros.',
      'Analise a imagem e encontre a TABELA NUTRICIONAL — pode estar em qualquer idioma, qualquer formato.',
      '',
      'INSTRUÇÕES:',
      '- Extraia os valores POR 100g. Se a tabela mostrar por porção, converta: valor_100g = (valor_porcao / porcao_g) × 100.',
      '- Se a foto estiver um pouco desfocada ou com sombra, tente mesmo assim com confidence \"low\" ou \"medium\".',
      '- productName: nome do produto (se não visível, use "Produto sem nome").',
      '- servingSizeG: tamanho da porção em gramas (se não visível, use 100).',
      '- fiberPer100g: use 0 se não informado.',
      '- confidence: "high" se leitura clara, "medium" se parcialmente legível, "low" se com dúvidas.',
      '- SEMPRE retorne JSON mesmo com baixa confiança — o usuário poderá corrigir os valores.',
      '- Responda APENAS com JSON puro, sem texto extra.',
      '',
      'Formato JSON obrigatório:',
      '{',
      '  "productName": "string",',
      '  "servingSizeG": número,',
      '  "kcalPer100g": número,',
      '  "proteinPer100g": número,',
      '  "carbsPer100g": número,',
      '  "fatPer100g": número,',
      '  "fiberPer100g": número,',
      '  "confidence": "high" | "medium" | "low"',
      '}',
    ].join('\n')

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: base64Data } },
    ])

    const rawText = result?.response?.text?.() || ''
    const extracted = extractJson(rawText)
    const parsed = LabelSchema.safeParse(extracted)

    if (!parsed.success || !isUsable(parsed.data)) {
      // Try once more with a simpler extraction prompt
      const retry = await model.generateContent([
        {
          text: [
            'Olhe com cuidado para esta imagem de embalagem/rótulo alimentar.',
            'Tente estimar as calorias e macronutrientes por 100g com base no que consegue ver.',
            'Retorne JSON: { "productName": "...", "servingSizeG": 100, "kcalPer100g": X, "proteinPer100g": X, "carbsPer100g": X, "fatPer100g": X, "fiberPer100g": 0, "confidence": "low" }',
            'Se absolutamente não conseguir, retorne: { "productName": "Produto", "servingSizeG": 100, "kcalPer100g": 0, "proteinPer100g": 0, "carbsPer100g": 0, "fatPer100g": 0, "fiberPer100g": 0, "confidence": "low" }',
          ].join('\n'),
        },
        { inlineData: { mimeType, data: base64Data } },
      ])
      const retryText = retry?.response?.text?.() || ''
      const retryExtracted = extractJson(retryText)
      const retryParsed = LabelSchema.safeParse(retryExtracted)

      if (!retryParsed.success) {
        return NextResponse.json({ ok: false, error: 'could_not_read_label' }, { status: 422 })
      }
      // Return even with kcal=0 so user can fill in manually
      const d = retryParsed.data
      return NextResponse.json({
        ok: true,
        data: {
          productName: d.productName,
          servingSizeG: Math.max(1, d.servingSizeG),
          kcalPer100g: d.kcalPer100g,
          proteinPer100g: d.proteinPer100g,
          carbsPer100g: d.carbsPer100g,
          fatPer100g: d.fatPer100g,
          fiberPer100g: d.fiberPer100g,
          confidence: 'low' as const,
        },
      })
    }

    const d = parsed.data
    return NextResponse.json({
      ok: true,
      data: {
        productName: d.productName,
        servingSizeG: Math.max(1, d.servingSizeG),
        kcalPer100g: Math.max(0, Math.min(900, d.kcalPer100g)),
        proteinPer100g: Math.max(0, Math.min(100, d.proteinPer100g)),
        carbsPer100g: Math.max(0, Math.min(100, d.carbsPer100g)),
        fatPer100g: Math.max(0, Math.min(100, d.fatPer100g)),
        fiberPer100g: Math.max(0, Math.min(100, d.fiberPer100g)),
        confidence: d.confidence,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

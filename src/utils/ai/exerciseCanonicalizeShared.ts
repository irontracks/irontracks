/**
 * Lógica compartilhada das rotas de canonicalização de nomes de exercício
 * (api/exercises/canonicalize e api/admin/exercises/canonicalize/backfill).
 *
 * Extraído sem mudança de comportamento — `JsonSchema` + `extractJson` eram
 * idênticos, e a chamada ao Gemini (gerar + extrair itens) era a mesma. O
 * PROMPT continua em cada rota (diferem ligeiramente, comportamento preservado).
 */
import { z } from 'zod'
import { parseJsonWithSchema } from '@/utils/zod'
import { getGeminiModel } from '@/utils/ai/gemini'

export const CanonItemsSchema = z.object({ items: z.array(z.record(z.unknown())).optional() }).passthrough()

export const extractCanonItemsJson = (raw: string) => {
  const text = String(raw || '').trim()
  if (!text) return null
  let candidate = text
  if (candidate.startsWith('```')) {
    const firstBreak = candidate.indexOf('\n')
    const lastFence = candidate.lastIndexOf('```')
    if (firstBreak !== -1 && lastFence !== -1) {
      candidate = candidate.substring(firstBreak + 1, lastFence).trim()
    }
  }
  const direct = parseJsonWithSchema(candidate, CanonItemsSchema)
  if (direct) return direct
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const slice = candidate.substring(start, end + 1)
  return parseJsonWithSchema(slice, CanonItemsSchema)
}

/**
 * Chama o Gemini com o `prompt` já montado e retorna o array `items` extraído.
 * Lança `missing_gemini_key` se a apiKey estiver vazia. Cada rota mantém seu
 * próprio prompt (eles divergem de propósito).
 */
export async function resolveCanonicalItems(apiKey: string, modelId: string, prompt: string): Promise<Array<Record<string, unknown>>> {
  const key = String(apiKey || '').trim()
  if (!key) throw new Error('missing_gemini_key')
  const model = getGeminiModel(key, modelId)
  const result = await model.generateContent(prompt)
  const text = (await result?.response?.text()) || ''
  const parsed = extractCanonItemsJson(text)
  const items = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).items : null
  return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : []
}

import { GoogleGenerativeAI, type GenerationConfig, type GenerativeModel } from '@google/generative-ai'
import { logWarn } from '@/lib/logger'

/**
 * Modelo de fallback — estável e rápido. Quando o modelo primário (ex.:
 * gemini-3.5-flash) está indisponível (503) ou lento demais (enfileira e
 * estoura o timeout da função), caímos para este automaticamente.
 */
const FALLBACK_MODEL = 'gemini-2.5-flash'

/**
 * Se o modelo primário não responder neste tempo, abortamos a espera e usamos
 * o fallback. Mantém a função bem abaixo do limite de 30s da Vercel.
 */
const PRIMARY_TIMEOUT_MS = 12_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('gemini_primary_timeout')), ms)),
  ])
}

/**
 * Creates a Gemini model with "thinking" disabled by default and automatic
 * fallback to a stable model.
 *
 * `gemini-2.5-flash` enables thinking by default; the reasoning tokens consume
 * the output budget BEFORE the visible response, truncating structured JSON
 * (finishReason MAX_TOKENS). `thinkingBudget: 0` disables it.
 *
 * Além disso, se o modelo primário falhar ou demorar mais que
 * {@link PRIMARY_TIMEOUT_MS}, `generateContent` cai automaticamente para o
 * {@link FALLBACK_MODEL} — sem o chamador precisar saber. Isso evita o 504
 * quando o modelo configurado (ex.: gemini-3.5-flash) está instável no Google.
 */
export function getGeminiModel(
  genAI: GoogleGenerativeAI,
  model: string,
  generationConfig: GenerationConfig = {},
): GenerativeModel {
  const cfg: GenerationConfig & { thinkingConfig?: { thinkingBudget: number } } = {
    thinkingConfig: { thinkingBudget: 0 },
    ...generationConfig,
  }
  const primary = genAI.getGenerativeModel({ model, generationConfig: cfg })

  // Já é o fallback → sem wrapper (evita recursão / dupla chamada).
  if (model === FALLBACK_MODEL) return primary

  const fallback = genAI.getGenerativeModel({ model: FALLBACK_MODEL, generationConfig: cfg })
  const primaryGenerate = primary.generateContent.bind(primary)

  primary.generateContent = (async (...args: Parameters<GenerativeModel['generateContent']>) => {
    try {
      return await withTimeout(primaryGenerate(...args), PRIMARY_TIMEOUT_MS)
    } catch (e) {
      try {
        logWarn('ai:gemini', `Modelo ${model} falhou/lento (${(e as Error)?.message || e}); usando ${FALLBACK_MODEL}`)
      } catch { /* logger nunca quebra o fallback */ }
      return await fallback.generateContent(...args)
    }
  }) as GenerativeModel['generateContent']

  return primary
}

import { GoogleGenAI, type GenerateContentParameters } from '@google/genai'
import { logWarn } from '@/lib/logger'

/**
 * Wrapper único sobre o SDK oficial @google/genai (substituiu o deprecado
 * @google/generative-ai). É o ÚNICO ponto do app que importa o SDK — todo o
 * resto chama `getGeminiModel(apiKey, model, config)` e recebe um shim que
 * preserva o contrato antigo `result.response.text()`, então os call-sites não
 * precisaram mudar de forma.
 *
 * Mantém os dois comportamentos do wrapper anterior:
 *  - thinking desligado por padrão (`thinkingBudget: 0`) para modelos que
 *    suportam (flash / flash-lite) — economiza tokens e evita truncar JSON;
 *  - fallback automático para {@link FALLBACK_MODEL} quando o modelo primário
 *    falha ou demora mais que {@link PRIMARY_TIMEOUT_MS}.
 */

/** Modelo de fallback — estável e rápido. */
const FALLBACK_MODEL = 'gemini-2.5-flash'

/** Se o primário não responder neste tempo, usamos o fallback. */
const PRIMARY_TIMEOUT_MS = 12_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('gemini_primary_timeout')), ms)),
  ])
}

/** Config de geração (campos do antigo GenerationConfig: maxOutputTokens, temperature, responseMimeType, etc.). */
export type GeminiGenerationConfig = Record<string, unknown>

/** Mesmos shapes que os call-sites já passavam: string | Part | Part[]. */
export type GeminiContents = GenerateContentParameters['contents']

/** Shim que reproduz o contrato antigo `result.response.text()`. */
export interface GeminiResult {
  response: { text: () => string }
}

export interface GeminiModelShim {
  generateContent: (contents: GeminiContents) => Promise<GeminiResult>
}

/**
 * `gemini-2.5-flash` (e flash-lite) habilita "thinking" por padrão; os tokens
 * de raciocínio consomem o budget de saída ANTES da resposta visível,
 * truncando JSON estruturado (finishReason MAX_TOKENS). `thinkingBudget: 0`
 * desliga. O 2.5 Pro NÃO permite desligar — por isso só aplicamos em flash.
 */
function buildConfig(model: string, generationConfig: GeminiGenerationConfig): Record<string, unknown> {
  const cfg: Record<string, unknown> = { ...generationConfig }
  if (/flash/i.test(model) && cfg.thinkingConfig === undefined) {
    cfg.thinkingConfig = { thinkingBudget: 0 }
  }
  return cfg
}

/**
 * Cria um "modelo" Gemini (shim) com thinking desligado por padrão e fallback
 * automático para um modelo estável.
 */
export function getGeminiModel(
  apiKey: string,
  model: string,
  generationConfig: GeminiGenerationConfig = {},
): GeminiModelShim {
  const ai = new GoogleGenAI({ apiKey })

  const callOnce = async (m: string, contents: GeminiContents): Promise<GeminiResult> => {
    const resp = await ai.models.generateContent({
      model: m,
      contents,
      config: buildConfig(m, generationConfig),
    })
    const text = typeof resp?.text === 'string' ? resp.text : ''
    return { response: { text: () => text } }
  }

  return {
    async generateContent(contents: GeminiContents): Promise<GeminiResult> {
      // Já é o fallback → sem race/segunda tentativa.
      if (model === FALLBACK_MODEL) return callOnce(model, contents)
      try {
        return await withTimeout(callOnce(model, contents), PRIMARY_TIMEOUT_MS)
      } catch (e) {
        try {
          logWarn('ai:gemini', `Modelo ${model} falhou/lento (${(e as Error)?.message || e}); usando ${FALLBACK_MODEL}`)
        } catch { /* logger nunca quebra o fallback */ }
        return callOnce(FALLBACK_MODEL, contents)
      }
    },
  }
}

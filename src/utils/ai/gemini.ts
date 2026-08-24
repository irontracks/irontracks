import { GoogleGenAI, type GenerateContentParameters } from '@google/genai'
import { logWarn, logWarnRemote } from '@/lib/logger'
import { DEFAULT_GEMINI_TEXT_MODEL, resolveGeminiModel } from './modelRegistry'

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

/**
 * Modelo de fallback — estável e rápido. Vem do registro para não virar um
 * segundo lugar onde um modelo morto pode se esconder: em 24/08/2026 este
 * arquivo apontava para `gemini-2.5-flash`, que tem desligamento anunciado
 * para ≥ 16/10/2026, ou seja, o "plano B" tinha data de validade.
 */
const FALLBACK_MODEL = DEFAULT_GEMINI_TEXT_MODEL

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
  /**
   * Streaming: itera pedaços de TEXTO conforme o modelo gera. Mesmo fallback
   * do generateContent, mas só até o 1º chunk — depois que o primário começou
   * a responder, trocar de modelo no meio duplicaria/misturaria a resposta.
   */
  generateContentStream: (contents: GeminiContents) => AsyncGenerator<string, void, unknown>
}

/**
 * Os modelos flash habilitam "thinking" por padrão; os tokens de raciocínio
 * consomem o budget de saída ANTES da resposta visível, truncando JSON
 * estruturado (finishReason MAX_TOKENS). `thinkingBudget: 0` desliga. Os
 * modelos `pro` NÃO permitem desligar — por isso só aplicamos em flash.
 *
 * Medido em 24/08/2026 contra a API, já no `gemini-3.1-flash-lite`: com o
 * budget zerado a resposta vem com `thoughtsTokenCount: 0`; sem ele, o
 * `gemini-2.5-flash` gastava 78 tokens de raciocínio no MESMO prompt de duas
 * linhas. A doc do Gemini 3 diz que "thinking não pode ser desligado" — na
 * prática a API aceita o budget 0 e o respeita, então isto continua valendo.
 */
function buildConfig(model: string, generationConfig: GeminiGenerationConfig): Record<string, unknown> {
  const cfg: Record<string, unknown> = { ...generationConfig }
  if (/flash/i.test(model) && cfg.thinkingConfig === undefined) {
    cfg.thinkingConfig = { thinkingBudget: 0 }
  }
  return cfg
}

/**
 * Modelos já avisados neste processo. Sem isso, uma env desatualizada geraria
 * um evento de Sentry por REQUEST — o aviso viraria ruído e seria silenciado,
 * que é o oposto do que ele existe para fazer.
 */
const warnedModels = new Set<string>()

/**
 * Cria um "modelo" Gemini (shim) com thinking desligado por padrão e fallback
 * automático para um modelo estável.
 *
 * O `model` pedido passa pelo registro ANTES de qualquer chamada: modelo já
 * desligado pelo Google (ou com desligamento anunciado) é substituído pelo
 * padrão do app. É aqui, e não no default da env, porque o valor que chega em
 * produção vem de uma env var — e env var desatualizada é exatamente o caso
 * que o saneamento precisa cobrir.
 */
export function getGeminiModel(
  apiKey: string,
  requestedModel: string,
  generationConfig: GeminiGenerationConfig = {},
): GeminiModelShim {
  const resolution = resolveGeminiModel(requestedModel)
  const model = resolution.modelId
  if (resolution.replacedReason && resolution.replacedReason !== 'empty' && !warnedModels.has(resolution.requested)) {
    warnedModels.add(resolution.requested)
    try {
      logWarnRemote(
        'ai:gemini',
        `Modelo "${resolution.requested}" está ${resolution.replacedReason === 'retired' ? 'desligado' : 'em retirada'}; usando "${model}"`,
        { requested: resolution.requested, used: model, reason: resolution.replacedReason },
      )
    } catch { /* aviso nunca pode derrubar a chamada de IA */ }
  }

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

  async function* streamOnce(m: string, contents: GeminiContents): AsyncGenerator<string, void, unknown> {
    const stream = await ai.models.generateContentStream({
      model: m,
      contents,
      config: buildConfig(m, generationConfig),
    })
    for await (const chunk of stream) {
      const t = typeof chunk?.text === 'string' ? chunk.text : ''
      if (t) yield t
    }
  }

  return {
    async *generateContentStream(contents: GeminiContents): AsyncGenerator<string, void, unknown> {
      if (model === FALLBACK_MODEL) {
        yield* streamOnce(model, contents)
        return
      }
      let started = false
      try {
        const it = streamOnce(model, contents)[Symbol.asyncIterator]()
        // Fallback só vale ANTES do 1º chunk: o timeout cobre a espera inicial.
        const first = await withTimeout(it.next(), PRIMARY_TIMEOUT_MS)
        if (!first.done) {
          started = true
          yield first.value
          for (let n = await it.next(); !n.done; n = await it.next()) yield n.value
        }
      } catch (e) {
        if (started) throw e
        try {
          logWarn('ai:gemini', `Stream ${model} falhou/lento (${(e as Error)?.message || e}); usando ${FALLBACK_MODEL}`)
        } catch { /* logger nunca quebra o fallback */ }
        yield* streamOnce(FALLBACK_MODEL, contents)
      }
    },

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

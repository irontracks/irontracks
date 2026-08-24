/**
 * Registro dos modelos Gemini — a fonte única sobre QUAL modelo o app pode usar.
 *
 * Nasceu de um susto medido em 24/08/2026: o default de `env.gemini.modelId`
 * era `gemini-1.5-pro`, e esse modelo foi **DESLIGADO pelo Google em
 * 24/09/2025**. As ~20 rotas de `api/ai/` leem esse getter. Nada quebrou até
 * hoje só porque a env var `GOOGLE_GENERATIVE_AI_MODEL_ID` está setada na
 * Vercel — ou seja, o app inteiro de IA dependia de uma variável de ambiente
 * não estar faltando. Tirar a var (ou criar um ambiente novo sem ela) derrubava
 * IA inteira com 404, e o default existia justamente para esse caso.
 *
 * Por isso o saneamento acontece na CHAMADA (`getGeminiModel`), não só no
 * default: env desatualizada não pode mandar o app falar com modelo morto.
 * Esse detalhe importa aqui em particular porque a env de produção mora num
 * painel que este repo não alcança pela CLI — se a migração dependesse de
 * alguém editar a var, ela não chegaria ao ar.
 *
 * Duas listas, com significados diferentes:
 *  - RETIRADO  → o Google já desligou. Chamar devolve 404. Substituição é
 *                obrigatória (o pedido falharia de qualquer forma).
 *  - EM RETIRADA → ainda responde, mas tem data marcada. Substituímos e
 *                avisamos, para a troca não depender de alguém lembrar.
 *
 * ⚠️ Só vale para modelos de TEXTO/multimodal de entrada. Modelo de IMAGEM
 * (`*-image`, `imagen-*`) e de ÁUDIO (`*-tts`, `*-native-audio`) fazem outra
 * coisa: trocá-los por um modelo de texto não seria degradação, seria quebra
 * silenciosa — o chamador pede uma imagem e recebe prosa. Esses passam intactos.
 */

/**
 * O padrão do app.
 *
 * Escolhido em 24/08/2026 medindo, não pelo folheto — é mais barato E melhor
 * que o `gemini-2.5-flash` que ele substitui:
 *  - preço: $0,25/$1,50 por 1M (in/out) contra $0,30/$2,50 → −17% na entrada
 *    e −40% na saída;
 *  - qualidade: 34 contra 21 no Artificial Analysis Intelligence Index;
 *  - latência: TTFT ~2,5× menor, e o `thinking` já nasce em `minimal`.
 *
 * Verificado contra a API com a chave de produção antes de virar padrão:
 * texto, JSON estruturado (`responseMimeType` + `responseSchema`), entrada
 * multimodal com imagem e streaming responderam 200, com a MESMA config que as
 * rotas já mandam hoje (`thinkingConfig: { thinkingBudget: 0 }` + `temperature`).
 * A migração é drop-in: nenhum contrato de rota precisou mudar.
 */
export const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-3.1-flash-lite'

/** Modelos que o Google JÁ desligou — chamar devolve 404. */
const RETIRED_PATTERNS: readonly RegExp[] = [
  /^gemini-1\.0/,
  /^gemini-1\.5/,
  /^gemini-pro$/,
  /^gemini-pro-vision$/,
  /^gemini-2\.0/,
]

/** Modelos vivos com data de desligamento anunciada (família 2.5: ≥ 16/10/2026). */
const SUNSETTING_PATTERNS: readonly RegExp[] = [
  /^gemini-2\.5/,
]

/**
 * Modelos de outra MODALIDADE (imagem, áudio, TTS). Ficam fora do saneamento:
 * substituir por um modelo de texto trocaria uma falha visível por uma resposta
 * errada com cara de certa.
 */
const OTHER_MODALITY_PATTERNS: readonly RegExp[] = [
  /-image(-|$)/,
  /^imagen-/,
  /-tts(-|$)/,
  /-native-audio/,
  /-live(-|$)/,
  /-computer-use/,
  /^gemini-robotics/,
]

function matchesAny(model: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(model))
}

/** `true` quando o modelo não é de geração de texto/multimodal-in. */
export function isNonTextGeminiModel(model: string): boolean {
  return matchesAny(model.trim(), OTHER_MODALITY_PATTERNS)
}

/** `true` quando o Google já desligou o modelo (a chamada devolveria 404). */
export function isRetiredGeminiModel(model: string): boolean {
  const m = model.trim()
  if (isNonTextGeminiModel(m)) return false
  return matchesAny(m, RETIRED_PATTERNS)
}

/** `true` quando o modelo ainda responde mas tem desligamento anunciado. */
export function isSunsettingGeminiModel(model: string): boolean {
  const m = model.trim()
  if (isNonTextGeminiModel(m)) return false
  return matchesAny(m, SUNSETTING_PATTERNS)
}

export type GeminiModelResolution = {
  /** O modelo que deve ser chamado de fato. */
  modelId: string
  /** O que veio do chamador (env, constante, parâmetro). */
  requested: string
  /** Por que houve troca — `null` quando o pedido foi respeitado. */
  replacedReason: 'retired' | 'sunsetting' | 'empty' | null
}

/**
 * Resolve o modelo que será chamado. Função PURA — quem quiser avisar que
 * houve troca lê `replacedReason` e loga por conta própria (o registro não
 * importa logger para não arrastar o Sentry a quem só quer saber o nome).
 */
export function resolveGeminiModel(
  requested: string | null | undefined,
  fallback: string = DEFAULT_GEMINI_TEXT_MODEL,
): GeminiModelResolution {
  const raw = (requested ?? '').trim()
  if (!raw) return { modelId: fallback, requested: raw, replacedReason: 'empty' }
  if (isRetiredGeminiModel(raw)) return { modelId: fallback, requested: raw, replacedReason: 'retired' }
  if (isSunsettingGeminiModel(raw)) return { modelId: fallback, requested: raw, replacedReason: 'sunsetting' }
  return { modelId: raw, requested: raw, replacedReason: null }
}

/** Açúcar para quem só quer o id já saneado. */
export function resolveGeminiModelId(
  requested: string | null | undefined,
  fallback: string = DEFAULT_GEMINI_TEXT_MODEL,
): string {
  return resolveGeminiModel(requested, fallback).modelId
}

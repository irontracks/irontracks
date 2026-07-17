/**
 * Atalho determinístico do chat de nutrição — puro, sem IA e sem rede.
 *
 * O caso de uso #1 ("se eu comer 5 ovos cozidos agora, pra quanto vai minhas
 * calorias e meus macros?") é uma frase de forma FIXA. Reconhecê-la com regex e
 * cair direto na cascata de alimentos (resolveFood) responde em ~200ms, com custo
 * zero e — o que importa — a MESMA resposta toda vez. Modelo é probabilístico:
 * a mesma pergunta duas vezes pode extrair "5 ovos" e "cinco ovos cozidos".
 *
 * O Gemini continua existindo, como FALLBACK pro que não casa aqui.
 */

/**
 * Formas de "e se eu comer X". A captura é sempre o grupo 1 = o alimento.
 * Ordem importa: as mais específicas primeiro.
 */
const SIMULATE_PATTERNS: readonly RegExp[] = [
  // "se eu comer 5 ovos, quanto fica?" / "e se eu comer 5 ovos agora"
  /(?:^|\b)(?:e\s+)?se\s+eu\s+(?:comer|tomar|beber|almo[çc]ar|jantar|lanchar)\s+(.+)$/i,
  // "quanto fica se eu comer 5 ovos" — a subordinada vem depois
  /(?:^|\b)(?:quanto|como)\s+(?:fica|vai|fico)\b.*?\bse\s+eu\s+(?:comer|tomar|beber)\s+(.+)$/i,
  // "comendo 5 ovos, quanto fica?"
  /(?:^|\b)(?:comendo|tomando|bebendo)\s+(.+)$/i,
  // "simular 5 ovos" / "simula 5 ovos"
  /(?:^|\b)simul(?:ar|a|e)\s+(.+)$/i,
]

/**
 * Cauda que o usuário fala mas que não é comida. Sem tirar, "agora" e "hoje" viram
 * unknownLine no parser, o resolveFood devolve null e a pergunta cai no Gemini à toa
 * — justamente no caso que este módulo existe pra resolver de graça.
 */
const NOISE_PATTERNS: readonly RegExp[] = [
  /\b(?:agora|hoje|ainda|mesmo|j[áa]|depois|mais\s+tarde|de\s+noite|hoje\s+[àa]\s+noite)\b/gi,
  // "que" no meio é fala corrente: "pra quanto QUE vai minhas calorias".
  /\b(?:pra|para)\s+quanto\s+(?:que\s+)?(?:vai|v[ãa]o|fica|ficam|fico).*$/i,
  /\bquanto\s+(?:que\s+)?(?:fica|ficam|vai|v[ãa]o|fico)\b.*$/i,
  /\b(?:minhas?|meus?)\s+(?:calorias?|macros?|prote[íi]na).*$/i,
  /\bcabe\s+na\s+(?:minha\s+)?meta\b.*$/i,
  /\be\s+os\s+macros\b.*$/i,
]

export interface SimulateIntent {
  kind: 'simulate'
  /** Texto do alimento, limpo, pronto pro resolveFood. */
  foodText: string
}

export interface UnknownIntent {
  kind: 'unknown'
}

export type ChatIntent = SimulateIntent | UnknownIntent

/**
 * Limpa a captura: tira ruído, pontuação de cauda e conectores soltos.
 * Exportada porque também serve pro `foodQuery` que o Gemini devolve — o modelo
 * tende a repetir a prosa do usuário ("5 ovos cozidos agora"), e a limpeza em TS
 * não é probabilística.
 */
export function cleanFoodText(raw: string): string {
  let out = String(raw ?? '')
  for (const re of NOISE_PATTERNS) out = out.replace(re, ' ')
  return out
    .replace(/[?!.,;:]+\s*$/g, '')
    .replace(/\s*\b(?:e|com|mais)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tenta reconhecer a pergunta SEM IA.
 * `unknown` NÃO é erro — é o sinal de "manda pro Gemini".
 */
export function detectIntent(question: string): ChatIntent {
  const text = String(question ?? '').trim()
  if (!text) return { kind: 'unknown' }

  for (const re of SIMULATE_PATTERNS) {
    const m = re.exec(text)
    if (!m) continue
    const foodText = cleanFoodText(m[1] ?? '')
    // Precisa sobrar comida depois da limpeza: "se eu comer agora" não é simulação.
    if (foodText.length < 2) continue
    // Precisa ter alguma letra (não só "se eu comer 5").
    if (!/[a-zà-ú]{2}/i.test(foodText)) continue
    return { kind: 'simulate', foodText }
  }

  return { kind: 'unknown' }
}

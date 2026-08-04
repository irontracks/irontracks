/**
 * foodItemSanity — o que PODE ser oferecido como substituto de um alimento.
 *
 * O repertório aprendido (`nutrition_learned_foods`) não é uma lista de alimentos:
 * é o que o usuário digitou no lançamento, e ele digita REFEIÇÃO INTEIRA. Amostra
 * real da conta do dono em 03/08/2026:
 *
 *   "Refeição de Arroz, Strogonoff e Batata Palha"            1070 kcal/100 g
 *   "Hambúrguer Reforçado (Pão brioche, 2 hambúrgueres…)"     1650 kcal/100 g
 *   "150g arroz branco, 250g peito de frango, 40g ketchup…"    595 kcal/100 g
 *   "50g de Whey Protein"                                      203 kcal/100 g
 *   "Pão Francês com Doce de Leite"                            301 kcal/100 g
 *
 * Três defeitos distintos, e todos quebram a troca de alimento:
 *
 * 1. COMPOSTO — "125 g de Pão Francês com Doce de Leite" é inexecutável: não diz
 *    quanto é de pão e quanto é de doce. O usuário não consegue seguir.
 * 2. DENSIDADE IMPOSSÍVEL — o teto físico de um alimento é ~884 kcal/100 g (óleo
 *    puro). 1070 e 1650 não são "por 100 g": é o TOTAL da refeição gravado no campo
 *    per_100g. Qualquer porção calculada em cima disso sai absurda.
 * 3. QUANTIDADE NO NOME — "125 g de *50g de Whey Protein*" não quer dizer nada.
 *
 * Isto NÃO limpa a tabela nem impede o usuário de lançar o que quiser: só decide
 * quem serve de SUBSTITUTO. Lançar "Refeição Completa" segue valendo para o diário.
 */

/** Teto físico: gordura pura tem ~884 kcal/100 g. Acima disso o dado está errado. */
export const MAX_PLAUSIBLE_KCAL_100G = 900

/**
 * Marcas de item composto. Testadas contra o nome normalizado (minúsculo, sem
 * acento) — `\b` em volta de "e"/"com" para não pegar "leite" ou "coma".
 */
const COMPOSITE_PATTERNS: RegExp[] = [
  /\bcom\b/,
  /\be\b/,
  /\+/,
  /,/,
  /\brefeicao\b/,
  /\(/, // "Hambúrguer Reforçado (Pão brioche, 2 hambúrgueres…)"
]

/**
 * Quantidade embutida no nome: "50g de whey", "2 latas de monster", "400ml leite",
 * "1 esfirra". Um substituto precisa ser o ALIMENTO; a porção quem calcula é o motor.
 */
const QUANTITY_PATTERNS: RegExp[] = [
  /\d+\s*(g|kg|ml|l)\b/,
  /^\d+\s/,
  /\b\d+\s*(lata|latas|unidade|unidades|fatia|fatias|colher|colheres|copo|copos|porcao|porcoes)\b/,
]

const normalize = (name: string): string =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/** Nome descreve mais de um alimento? */
export function isCompositeFoodName(name: string): boolean {
  const n = normalize(name)
  if (!n) return false
  return COMPOSITE_PATTERNS.some((re) => re.test(n))
}

/** Nome carrega quantidade (logo, não é um alimento genérico)? */
export function hasEmbeddedQuantity(name: string): boolean {
  const n = normalize(name)
  if (!n) return false
  return QUANTITY_PATTERNS.some((re) => re.test(n))
}

/** Macros por 100 g fisicamente possíveis? */
export function hasPlausibleDensity(macros: { kcal: number; protein: number; carbs: number; fat: number }): boolean {
  const kcal = Number(macros?.kcal)
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > MAX_PLAUSIBLE_KCAL_100G) return false
  // Nenhum macro isolado passa de 100 g dentro de 100 g de comida.
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    const v = Number(macros?.[key])
    if (!Number.isFinite(v) || v < 0 || v > 100) return false
  }
  return true
}

/**
 * Serve como substituto? Falha em qualquer um dos três critérios = não serve.
 *
 * Ser conservador aqui é de propósito: perder um candidato bom custa "não achei
 * outro alimento pra trocar"; aceitar um ruim custa uma sugestão que o usuário não
 * consegue executar — e ele perde a confiança na feature inteira.
 */
export function isUsableAsSwapCandidate(candidate: {
  name: string
  kcal: number
  protein: number
  carbs: number
  fat: number
}): boolean {
  const name = String(candidate?.name ?? '').trim()
  if (name.length < 2 || name.length > 60) return false
  if (isCompositeFoodName(name)) return false
  if (hasEmbeddedQuantity(name)) return false
  if (!hasPlausibleDensity(candidate)) return false
  // Sem nenhum macro não dá pra dimensionar porção.
  return Number(candidate.kcal) > 0 || Number(candidate.protein) > 0 || Number(candidate.carbs) > 0 || Number(candidate.fat) > 0
}

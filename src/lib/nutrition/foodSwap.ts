/**
 * foodSwap — troca um alimento do cardápio por outro da MESMA classe, sem IA.
 *
 * Por que sem IA: a troca é um botão que o usuário aperta várias vezes por refeição
 * ("gerou macarrão, não quero"). Cada clique seria uma chamada paga ao Gemini e 1–3 s
 * de espera. Aqui é instantâneo, custa zero e usa o que o usuário JÁ come.
 *
 * A classe sai dos MACROS, não de uma lista de nomes: é a única forma que funciona
 * igual para as três fontes (alimentos aprendidos do usuário, custom cadastrados por
 * ele, e a base curada TACO/USDA). Uma lista de nomes cobriria só a base e deixaria
 * de fora justamente o que o usuário cadastrou.
 *
 * O que a troca preserva é o PAPEL do alimento na refeição, não as calorias cegas:
 * trocar frango por atum mantém a proteína; trocar arroz por macarrão mantém o
 * carboidrato. Casar só kcal daria 300 g de alface no lugar de 100 g de frango.
 */

import { normalizeFoodKey } from './learned-foods'
import { fitsMealGroup, isPreferredForMealGroup, type FoodMealMap, type MealGroup } from './mealContext'
import { isRoleCompatible } from './mealCoherence'

/** Macros por 100 g — denominador comum das três fontes. */
export interface FoodMacros {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export interface SwapCandidate extends FoodMacros {
  name: string
  /** De onde veio — decide desempate: o que o usuário já come vem primeiro. */
  source: 'learned' | 'custom' | 'database'
}

/** Item do cardápio que vai ser trocado (porção real, não por 100 g). */
export interface SwappableItem {
  food: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type FoodClass = 'protein' | 'carb' | 'fat' | 'produce' | 'mixed'

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const

/**
 * Abaixo disto é volume, não fonte de energia — folha e legume leve caem aqui.
 *
 * LIMITE ASSUMIDO: isto não separa fruta de amido. Banana (89 kcal/100 g) e batata
 * doce (86) são indistinguíveis por macro — as duas são carboidrato denso e quase
 * sem proteína — então banana fica em `carb`. Separá-las exigiria lista de nomes,
 * que não cobriria os alimentos que o próprio usuário cadastra, que é justamente
 * o repertório que faz a sugestão parecer dele. Quem evita a troca esquisita
 * (arroz → banana) é o desempate por densidade calórica no `swapFood`.
 */
const PRODUCE_MAX_KCAL_100G = 80

/**
 * Proteína suficiente para o alimento ser "fonte de proteína" no prato, mesmo que a
 * gordura domine as calorias. 10 g/100 g separa carne, ovo, peixe e laticínio
 * proteico de creme, óleo e condimento.
 */
const PROTEIN_FLOOR_G_100G = 10

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Classe do alimento pela participação de cada macro nas calorias.
 *
 * Os cortes não somam 100% de propósito: um alimento pode ser proteico E gorduroso
 * (queijo), e nesse caso a proteína manda — é o papel dele no prato. Sobra `mixed`
 * para o que não tem dominante claro (pratos prontos), que só troca por outro misto.
 */
export function classifyFood(macros: FoodMacros): FoodClass {
  const kcal = num(macros.kcal)
  const p = num(macros.protein) * KCAL_PER_G.protein
  const c = num(macros.carbs) * KCAL_PER_G.carbs
  const f = num(macros.fat) * KCAL_PER_G.fat
  const total = p + c + f

  // Sem macro nenhum (café, água, refrigerante zero): trata como misto — trocar
  // por "equivalente calórico" aqui não tem sentido.
  if (total <= 0) return 'mixed'

  const pPct = p / total
  const cPct = c / total
  const fPct = f / total
  const proteinG = num(macros.protein)

  // PROTEÍNA MANDA quando há proteína de verdade, mesmo com muita gordura junto.
  // Sem esta regra, bife (26 P / 15 G) caía em `fat` e era trocado por ovo, azeite
  // ou maionese — auditoria de 04/08/2026 contra o histórico real. O papel do bife
  // no prato é proteína; a gordura vem junto.
  if (proteinG >= PROTEIN_FLOOR_G_100G && pPct >= 0.25) return 'protein'

  // Fruta/verdura: carbo dominante E pouca proteína E pouca densidade. O corte de
  // proteína (35% das calorias) separa leite desnatado — 3,4 P em 35 kcal, 39% —
  // de alface e brócolis, que ficam em 26–29%. Sem ele, leite virava substituto de
  // mamão, batata e feijão na auditoria de 04/08/2026; com ele apertado demais
  // (25%), a alface caía em `carb` e passava a competir com arroz.
  if (kcal > 0 && kcal < PRODUCE_MAX_KCAL_100G && cPct >= 0.5 && pPct < 0.35) return 'produce'

  if (pPct >= 0.4) return 'protein'
  if (fPct >= 0.45) return 'fat'
  if (cPct >= 0.45) return 'carb'
  return 'mixed'
}

/** Macros por 100 g inferidos da porção do cardápio. */
export function macrosPer100g(item: SwappableItem): FoodMacros {
  const grams = num(item.grams)
  if (grams <= 0) {
    return { kcal: num(item.calories), protein: num(item.protein), carbs: num(item.carbs), fat: num(item.fat) }
  }
  const factor = 100 / grams
  return {
    kcal: num(item.calories) * factor,
    protein: num(item.protein) * factor,
    carbs: num(item.carbs) * factor,
    fat: num(item.fat) * factor,
  }
}

/** O macro que a troca tenta preservar — o papel do alimento no prato. */
export function anchorMacroOf(cls: FoodClass): 'protein' | 'carbs' | 'fat' | 'kcal' {
  if (cls === 'protein') return 'protein'
  if (cls === 'carb') return 'carbs'
  if (cls === 'fat') return 'fat'
  return 'kcal' // produce e mixed: calorias é o que resta de comparável
}

const PORTION_MIN_G = 10
const PORTION_MAX_G = 1_000

/**
 * Teto de desvio calórico da troca (35%). O substituto tem de manter o macro-âncora
 * E não desandar as calorias do prato — as duas coisas, não uma. Ver `kcalDrift`.
 */
const MAX_KCAL_DRIFT = 0.35

/**
 * Porção do substituto que entrega a mesma quantidade do macro-âncora.
 * Arredonda em 5 g — ninguém pesa 137 g de arroz — e limita a faixa: sem o teto,
 * casar 40 g de proteína com alface pediria quilos.
 */
export function portionFor(candidate: SwapCandidate, target: number, anchor: 'protein' | 'carbs' | 'fat' | 'kcal'): number {
  const per100 = anchor === 'kcal' ? num(candidate.kcal) : num(candidate[anchor])
  if (per100 <= 0 || target <= 0) return 0
  const grams = (target / per100) * 100
  const rounded = Math.round(grams / 5) * 5
  return Math.min(PORTION_MAX_G, Math.max(PORTION_MIN_G, rounded))
}

const SOURCE_RANK: Record<SwapCandidate['source'], number> = { learned: 0, custom: 1, database: 2 }

/**
 * Mesmo alimento com outro nome? Comparar a chave inteira não basta: "Arroz" e
 * "arroz cozido" são chaves diferentes, e trocar um pelo outro devolveria
 * praticamente a mesma comida — o usuário aperta "trocar" e nada muda de verdade.
 *
 * Regra: se TODAS as palavras do nome mais curto aparecem no mais longo, é o mesmo
 * alimento base ("arroz" ⊂ "arroz cozido", "frango" ⊂ "peito de frango").
 * Assume falso positivo ocasional ("leite" ⊂ "leite de coco") de propósito — perder
 * um candidato é bem menos ruim que entregar o mesmo prato como se fosse novidade.
 */
function isSameBaseFood(a: string, b: string): boolean {
  const ta = a.split(' ').filter(Boolean)
  const tb = b.split(' ').filter(Boolean)
  if (!ta.length || !tb.length) return false
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const longerSet = new Set(longer)
  return shorter.every((t) => longerSet.has(t))
}

export interface SwapResult {
  food: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
  /** Classe casada — a UI usa pra explicar ("outra fonte de proteína"). */
  foodClass: FoodClass
  source: SwapCandidate['source']
}

export interface SwapOptions {
  /** Nomes que NÃO podem voltar: o próprio item, o resto da refeição, e o que já foi recusado. */
  exclude?: string[]
  /**
   * Em que tipo de refeição a troca está acontecendo, e o que o usuário já comeu em
   * cada tipo. Sem isso, macro certo aceita refeição errada — "Macarrão" no ALMOÇO
   * virou "Pão Francês com Doce de Leite" em 03/08/2026. Ver `mealContext`.
   */
  mealGroup?: MealGroup
  foodMealMap?: FoodMealMap
}

/**
 * Escolhe o substituto. Devolve `null` quando não há candidato da mesma classe —
 * o chamador mantém o alimento e avisa, em vez de trocar por algo de outra natureza.
 *
 * Ordem: fonte (o que o usuário já come primeiro) e, dentro dela, a densidade
 * calórica mais parecida — assim a porção resultante fica perto da original e o
 * prato continua com cara de prato.
 */
export function swapFood(item: SwappableItem, candidates: SwapCandidate[], options: SwapOptions = {}): SwapResult | null {
  return rankSwapOptions(item, candidates, options)[0] ?? null
}

/**
 * A MESMA escolha do `swapFood`, mas devolvendo a lista inteira em ordem.
 *
 * Existe porque o card do plano passou a OFERECER a alternativa em vez de sortear
 * uma (01/09/2026): "Peito de frango 180 g" mostra embaixo "opção: 200 g de carne
 * moída", e para isso alguém precisa ver mais que o primeiro colocado — a segunda
 * fonte de proteína pode estar no 4º lugar do ranking, atrás de três formas de
 * frango.
 *
 * `swapFood` é o topo desta lista, não um segundo motor: um ranking paralelo
 * divergiria do botão de trocar na primeira regra nova (é a armadilha que já custou
 * 14 renderers de série neste repo).
 */
export function rankSwapOptions(
  item: SwappableItem,
  candidates: SwapCandidate[],
  options: SwapOptions = {},
): SwapResult[] {
  const per100 = macrosPer100g(item)
  const cls = classifyFood(per100)

  // `mixed` = não deu pra dizer qual é o papel do alimento no prato. Trocar aqui é
  // chute: na auditoria de 04/08/2026, "arroz" com macros mal parseados (16 P e 11 G
  // em 150 g) caiu em mixed e foi trocado por "orange chicken". Recusar é melhor —
  // o usuário mantém o que tem e a feature não perde a credibilidade.
  if (cls === 'mixed') return []

  const anchor = anchorMacroOf(cls)

  const blocked = new Set(
    [item.food, ...(options.exclude ?? [])]
      .map((n) => normalizeFoodKey(String(n ?? '')))
      .filter(Boolean),
  )

  const mealGroup: MealGroup = options.mealGroup ?? 'unknown'
  const mealMap = options.foodMealMap
  const blockedList = [...blocked]
  const pool = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && String(c.name ?? '').trim())
    .filter((c) => {
      const key = normalizeFoodKey(c.name)
      if (blocked.has(key)) return false
      // "Arroz" → "arroz cozido" seria trocar por si mesmo.
      return !blockedList.some((b) => isSameBaseFood(key, b))
    })
    .filter((c) => classifyFood(c) === cls)
    // Adequação à refeição: o histórico do usuário decide. Alimento sem histórico
    // passa (não bloqueia o desconhecido, só não ganha preferência) — bloquear
    // esvaziaria a troca de quem tem pouco lançamento.
    .filter((c) => !mealMap || fitsMealGroup(c.name, mealGroup, mealMap))
    // A classe de macro autoriza a troca; o PAPEL no prato é outra pergunta. Ver
    // `isRoleCompatible`: doce de leite não vira a base do café, whey não vira o
    // prato do jantar — mesmo com o macro batendo.
    .filter((c) => isRoleCompatible(item.food, c.name, mealGroup === 'main'))

  if (!pool.length) return []

  const targetAmount = anchor === 'kcal' ? num(item.calories) : num(item[anchor])
  const originalKcal = num(item.calories)

  /**
   * Desvio calórico que a troca provoca. Preservar só o macro-âncora não basta:
   * 62 g de proteína em salmão (20 P / 208 kcal por 100 g) pedem 310 g e entregam
   * ~645 kcal no lugar de 330 — quase o DOBRO. A dieta inteira desanda por uma
   * troca que, no papel, "manteve a proteína".
   */
  const kcalDrift = (c: SwapCandidate, portion: number): number => {
    if (originalKcal <= 0) return 0
    return Math.abs(num(c.kcal) * (portion / 100) - originalKcal) / originalKcal
  }

  const ranked = pool
    // Dentro de `fat`, gordura casa com gordura: sem isto, maionese e azeite eram
    // trocados por bolo de chocolate — os dois "são gordura" pelo macro dominante,
    // mas um é condimento e o outro é sobremesa (auditoria de 04/08/2026).
    .filter((c) => {
      if (cls !== 'fat') return true
      const carbKcal = num(c.carbs) * KCAL_PER_G.carbs
      const totalKcal = carbKcal + num(c.protein) * KCAL_PER_G.protein + num(c.fat) * KCAL_PER_G.fat
      return totalKcal <= 0 || carbKcal / totalKcal < 0.25
    })
    .map((c) => ({ c, portion: portionFor(c, targetAmount, anchor) }))
    .filter((x) => x.portion > 0)
    // Porção que ENCOSTOU no limite é sinal de casamento ruim, não de porção certa:
    // "Choco Biscuit → 1000 g de leite" saía do clamp, não de uma conta que fechou.
    .filter((x) => x.portion > PORTION_MIN_G && x.portion < PORTION_MAX_G)
    .map((x) => ({ ...x, drift: kcalDrift(x.c, x.portion) }))
    // Acima disso não é substituto, é outra refeição.
    .filter((x) => x.drift <= MAX_KCAL_DRIFT)
    .sort((a, b) => {
      // Confirmado pelo histórico NAQUELA refeição vem primeiro, antes até da fonte:
      // um alimento que ele comprovadamente come no almoço ganha de um da base curada
      // que só não foi reprovado por falta de histórico.
      if (mealMap) {
        const prefA = isPreferredForMealGroup(a.c.name, mealGroup, mealMap) ? 0 : 1
        const prefB = isPreferredForMealGroup(b.c.name, mealGroup, mealMap) ? 0 : 1
        if (prefA !== prefB) return prefA - prefB
      }
      const bySource = SOURCE_RANK[a.c.source] - SOURCE_RANK[b.c.source]
      if (bySource !== 0) return bySource
      if (a.drift !== b.drift) return a.drift - b.drift
      return a.c.name.localeCompare(b.c.name)
    })

  const round1 = (n: number) => Math.round(n * 10) / 10
  return ranked.map(({ c, portion }) => {
    const factor = portion / 100
    return {
      food: c.name,
      grams: portion,
      calories: Math.round(num(c.kcal) * factor),
      protein: round1(num(c.protein) * factor),
      carbs: round1(num(c.carbs) * factor),
      fat: round1(num(c.fat) * factor),
      foodClass: cls,
      source: c.source,
    }
  })
}

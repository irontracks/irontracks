/**
 * mealCoherence — a refeição gerada precisa ser COMÍVEL, não só bater o macro.
 *
 * O gerador otimizava um número e entregava um saco de itens. Caso real da conta do
 * dono (plano "Cardioprotetor", 04/08/2026):
 *
 *   Café da manhã  →  biscoito de arroz · doce de leite · whey 30 g · aveia 40 g
 *   Ceia           →  whey 50 g · linhaça · abacate · creatina 5 g
 *
 * Whey e aveia SECOS, sem uma gota de líquido: não existe como executar. O usuário
 * abriu o app e perguntou "como como isso tudo sem um leite?" — e ele está certo.
 *
 * Duas classes de defeito, tratadas de formas diferentes de propósito:
 *
 * 1. VEÍCULO FALTANDO (pó sem líquido) — é objetivo e tem conserto óbvio: falta um
 *    ingrediente. Detecta e REPARA, acrescentando o líquido à própria refeição.
 * 2. INCOERÊNCIA DE COMPOSIÇÃO (dois doces concentrados na mesma refeição, doce como
 *    base do café da manhã) — é julgamento, e o conserto mecânico seria REMOVER
 *    comida, o que derruba o plano abaixo da meta calórica. Só reporta, para a rota
 *    devolver o problema à IA e pedir de novo. Nunca amputa o prato.
 *
 * Determinístico e sem IA: é guard, e guard que depende de LLM não é guard.
 */

const normalize = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/* ── Veículo ──────────────────────────────────────────────────────────────── */

/**
 * Tipo de líquido que o item exige.
 *  - `any`    → dissolve em água (whey, creatina, colágeno). Água resolve e não
 *               mexe em caloria nenhuma.
 *  - `creamy` → precisa de base láctea/iogurte pra virar comida (aveia, sucrilhos,
 *               cacau em pó). Mingau de água até existe, mas ninguém come.
 */
export type VehicleKind = 'any' | 'creamy'

type DryFood = { id: string; pattern: RegExp; vehicle: VehicleKind }

/** Alimentos em pó/secos que NÃO se comem sozinhos. */
const DRY_FOODS: readonly DryFood[] = [
  { id: 'whey', pattern: /\bwhey\b|proteina em po|prote[ií]na isolada|albumina|caseina|colageno em po/, vehicle: 'any' },
  { id: 'creatina', pattern: /\bcreatina\b/, vehicle: 'any' },
  { id: 'pre-treino', pattern: /pre.?treino em po|beta.?alanina|cafeina em po|glutamina/, vehicle: 'any' },
  { id: 'aveia', pattern: /\baveia\b|farelo de aveia|granola|sucrilhos|cereal matinal|\bmingau\b|flocos de milho/, vehicle: 'creamy' },
  { id: 'cacau', pattern: /cacau em po|achocolatado|leite em po|nescau|\btoddy\b/, vehicle: 'creamy' },
]

/**
 * O que CONTA como líquido. As três exclusões no começo não são detalhe: "doce de
 * leite", "leite condensado" e "leite em pó" casariam com /leite/ e fariam o guard
 * declarar que o café da manhã do caso real já tinha veículo — exatamente a refeição
 * que ele existe pra pegar.
 */
const NOT_A_LIQUID = /doce de leite|leite condensado|leite em po|creme de leite/
const LIQUID = /\bleite\b|\biogurte\b|\bagua\b|\bsuco\b|bebida vegetal|\bkefir\b|\bcafe\b|\bcha\b|\bvitamina\b|\bsmoothie\b|\bshake\b|\bcoalhada\b/

/** Este item é um líquido que serve de veículo? */
export function isLiquidVehicle(foodName: unknown): boolean {
  const n = normalize(foodName)
  if (!n) return false
  if (NOT_A_LIQUID.test(n)) return false
  return LIQUID.test(n)
}

/** Este item é um pó/seco que exige líquido? Devolve o tipo exigido, ou null. */
export function requiredVehicle(foodName: unknown): VehicleKind | null {
  const n = normalize(foodName)
  if (!n) return null
  // Produto pronto pra beber já vem com líquido ("iogurte proteico", "whey pronto").
  if (isLiquidVehicle(n)) return null
  for (const dry of DRY_FOODS) if (dry.pattern.test(n)) return dry.vehicle
  return null
}

/* ── Doce concentrado ─────────────────────────────────────────────────────── */

/**
 * Açúcar concentrado — acompanhamento, nunca base de refeição. Num plano com
 * dislipidemia (o caso real chamava-se "Cardioprotetor") dois deles no mesmo prato
 * contradizem o próprio nome do plano.
 */
const CONCENTRATED_SWEET = /doce de leite|leite condensado|geleia|\bmel\b|chocolate|brigadeiro|nutella|creme de avela|\bacucar\b|calda de|cobertura de|\bpaçoca\b|\bpacoca\b|\bgoiabada\b/

export function isConcentratedSweet(foodName: unknown): boolean {
  const n = normalize(foodName)
  return Boolean(n) && CONCENTRATED_SWEET.test(n)
}

/** Máximo de doces concentrados no dia inteiro. Um é tempero; dois viram a dieta. */
export const MAX_SWEETS_PER_DAY = 1

/* ── Modelo mínimo do que se valida ───────────────────────────────────────── */

export type CoherenceItem = {
  food: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

export type CoherenceMeal = {
  name: string
  time?: string
  items: CoherenceItem[]
}

export type CoherenceIssue = {
  /** Índice da refeição no dia — o reparo e a mensagem de retry apontam pra cá. */
  mealIndex: number
  mealName: string
  kind: 'missing_vehicle' | 'sweet_overload' | 'sweet_as_base'
  /** Frase pronta pra devolver à IA no retry. Em pt-BR: o prompt inteiro é pt-BR. */
  message: string
  /** Só em `missing_vehicle`: que líquido resolve. */
  vehicle?: VehicleKind
}

/* ── Detecção ─────────────────────────────────────────────────────────────── */

/**
 * Falta veículo nesta refeição? Devolve o tipo mais exigente presente (`creamy`
 * ganha de `any`: um copo de leite serve o whey E a aveia; água não serve a aveia).
 */
export function missingVehicleOf(meal: CoherenceMeal): { vehicle: VehicleKind; foods: string[] } | null {
  const items = Array.isArray(meal?.items) ? meal.items : []
  if (items.some((it) => isLiquidVehicle(it?.food))) return null

  const dry = items
    .map((it) => ({ food: String(it?.food ?? ''), vehicle: requiredVehicle(it?.food) }))
    .filter((x): x is { food: string; vehicle: VehicleKind } => x.vehicle !== null)
  if (!dry.length) return null

  return {
    vehicle: dry.some((d) => d.vehicle === 'creamy') ? 'creamy' : 'any',
    foods: dry.map((d) => d.food),
  }
}

/**
 * Todos os problemas do dia. Ordem estável (refeição, depois tipo) — a mensagem de
 * retry precisa ser reprodutível pra ser testável.
 */
export function findCoherenceIssues(meals: CoherenceMeal[]): CoherenceIssue[] {
  const list = Array.isArray(meals) ? meals : []
  const issues: CoherenceIssue[] = []

  list.forEach((meal, mealIndex) => {
    const mealName = String(meal?.name ?? '')
    const items = Array.isArray(meal?.items) ? meal.items : []

    const missing = missingVehicleOf(meal)
    if (missing) {
      issues.push({
        mealIndex,
        mealName,
        kind: 'missing_vehicle',
        vehicle: missing.vehicle,
        message: `"${mealName}" tem ${missing.foods.join(' e ')} sem nenhum líquido para preparar. Inclua o líquido (leite, iogurte ou água) como item da refeição.`,
      })
    }

    const sweets = items.filter((it) => isConcentratedSweet(it?.food))
    if (sweets.length > 1) {
      issues.push({
        mealIndex,
        mealName,
        kind: 'sweet_overload',
        message: `"${mealName}" tem ${sweets.length} doces concentrados juntos (${sweets.map((s) => s.food).join(', ')}). No máximo um por refeição.`,
      })
    }

    // Doce como MAIOR fonte calórica da refeição = ele virou a base do prato.
    const total = items.reduce((acc, it) => acc + (Number(it?.calories) || 0), 0)
    const fromSweets = sweets.reduce((acc, it) => acc + (Number(it?.calories) || 0), 0)
    if (sweets.length > 0 && total > 0 && fromSweets / total > 0.4) {
      issues.push({
        mealIndex,
        mealName,
        kind: 'sweet_as_base',
        message: `Em "${mealName}" o doce responde por ${Math.round((fromSweets / total) * 100)}% das calorias. Doce é acompanhamento, não a base da refeição.`,
      })
    }
  })

  const totalSweets = list.reduce(
    (acc, meal) => acc + (Array.isArray(meal?.items) ? meal.items.filter((it) => isConcentratedSweet(it?.food)).length : 0),
    0,
  )
  if (totalSweets > MAX_SWEETS_PER_DAY) {
    issues.push({
      mealIndex: -1,
      mealName: '',
      kind: 'sweet_overload',
      message: `O dia inteiro tem ${totalSweets} doces concentrados. Use no máximo ${MAX_SWEETS_PER_DAY} no dia.`,
    })
  }

  return issues
}

/* ── Reparo ───────────────────────────────────────────────────────────────── */

/**
 * Os dois veículos padrão. A água é de propósito o default do `any`: ela resolve o
 * whey/creatina sem mexer em uma caloria do plano que acabou de ser ajustado à meta.
 * Leite desnatado (TACO: 35 kcal/100 ml) só onde água não faz comida.
 */
const VEHICLES: Record<VehicleKind, CoherenceItem> = {
  any: { food: 'Água', grams: 300, calories: 0, protein: 0, carbs: 0, fat: 0 },
  creamy: { food: 'Leite desnatado', grams: 200, calories: 70, protein: 7, carbs: 10, fat: 1 },
}

/**
 * Acrescenta o líquido faltante nas refeições que precisam. NÃO remove nada e não
 * toca nos outros problemas — remover comida derrubaria o plano abaixo da meta, e
 * essa decisão é da IA no retry, não de uma regex.
 *
 * Devolve refeições novas (sem mutar a entrada) e a contagem de reparos, que a rota
 * usa pra decidir se vale registrar telemetria.
 */
export function repairMissingVehicles<M extends CoherenceMeal>(meals: M[]): { meals: M[]; repaired: number } {
  const list = Array.isArray(meals) ? meals : []
  let repaired = 0

  const out = list.map((meal) => {
    const missing = missingVehicleOf(meal)
    if (!missing) return meal
    repaired += 1
    return { ...meal, items: [...(meal.items ?? []), { ...VEHICLES[missing.vehicle] }] }
  })

  return { meals: out, repaired }
}

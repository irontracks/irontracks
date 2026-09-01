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
  // "proteína de soja" entrou em 01/09/2026: é o pó que o dono bate com leite todo
  // dia, e sem ele a regra "pó sai, pó entra" tratava a soja como comida de prato —
  // liberando trocar o whey do lanche por 120 g de patinho.
  { id: 'whey', pattern: /\bwhey\b|proteina em po|prote[ií]na isolada|prote[ií]na de soja|prote[ií]na de ervilha|albumina|caseina|colageno em po/, vehicle: 'any' },
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
/** Base láctea/cremosa — serve para QUALQUER pó, inclusive os que exigem `creamy`. */
const CREAMY_LIQUID = /\bleite\b|\biogurte\b|\bkefir\b|\bcoalhada\b|bebida vegetal|\bvitamina\b|\bsmoothie\b|\bshake\b/
/** Líquido fino — dissolve whey e creatina, NÃO faz mingau de aveia nem cereal. */
const THIN_LIQUID = /\bagua\b|\bsuco\b|\bcafe\b|\bcha\b|\bchimarrao\b/

/**
 * Que tipo de veículo este item FORNECE — `null` se não for líquido.
 *
 * A distinção importa: um lanche com "sucrilhos + Água" satisfazia o guard antigo
 * (que só perguntava "tem líquido?") e continua sendo cereal com água. Caso real:
 * a variação da semana trocou o abacate por sucrilhos numa refeição cujo único
 * líquido era água, e o guard deixou passar.
 */
export function liquidKindOf(foodName: unknown): VehicleKind | null {
  const n = normalize(foodName)
  if (!n) return null
  if (NOT_A_LIQUID.test(n)) return null
  if (CREAMY_LIQUID.test(n)) return 'creamy'
  if (THIN_LIQUID.test(n)) return 'any'
  return null
}

/** Este item é um líquido que serve de veículo (de qualquer tipo)? */
export function isLiquidVehicle(foodName: unknown): boolean {
  return liquidKindOf(foodName) !== null
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

/* ── Papel do alimento na troca ───────────────────────────────────────────── */

/**
 * O candidato pode assumir o PAPEL do alimento que sai?
 *
 * A classe de macro diz que dois alimentos são intercambiáveis; ela não diz que um
 * pode ocupar o lugar do outro no prato. Dois casos vistos no plano real de
 * 04/08/2026, ambos com a classe certa:
 *
 *   pão francês 100 g  →  doce de leite 105 g   (carbo por carbo, no café da manhã)
 *   patinho moído 200 g →  whey growth 95 g     (proteína por proteína, no jantar)
 *
 * Ninguém come 105 g de doce de leite como base do café, nem janta um scoop de whey.
 * As duas regras abaixo são estreitas de propósito: doce continua trocando por doce,
 * e o whey continua trocando por outro suplemento no lanche.
 */
export function isRoleCompatible(originalFood: unknown, candidateFood: unknown, isMainMeal: boolean): boolean {
  // 1. Doce concentrado só entra no lugar de outro doce concentrado.
  if (isConcentratedSweet(candidateFood) && !isConcentratedSweet(originalFood)) return false

  // 2. Suplemento em pó não vira o prato do almoço/jantar. Se o alimento que sai já
  //    era um pó, a troca segue liberada (whey → proteína de soja).
  if (isMainMeal && requiredVehicle(candidateFood) !== null && requiredVehicle(originalFood) === null) return false

  // 3. E o contrário também, em QUALQUER refeição: pó sai, pó entra. Medido em
  //    01/09/2026 contra o plano real do dono — o card oferecia "120 g de patinho"
  //    no lugar do whey do lanche batido com aveia e leite. Pelo macro é impecável;
  //    ninguém põe carne no liquidificador. A regra 2 não pegava porque só olha a
  //    refeição principal, e o lanche não é uma.
  if (requiredVehicle(originalFood) !== null && requiredVehicle(candidateFood) === null) return false

  return true
}

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
  kind: 'missing_vehicle' | 'sweet_overload' | 'sweet_as_base' | 'training_window'
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

  const dry = items
    .map((it) => ({ food: String(it?.food ?? ''), vehicle: requiredVehicle(it?.food) }))
    .filter((x): x is { food: string; vehicle: VehicleKind } => x.vehicle !== null)
  if (!dry.length) return null

  const needed: VehicleKind = dry.some((d) => d.vehicle === 'creamy') ? 'creamy' : 'any'
  // Água satisfaz `any` e NÃO satisfaz `creamy` — cereal com água não é refeição.
  const satisfied = items.some((it) => {
    const kind = liquidKindOf(it?.food)
    return kind === 'creamy' || (kind === 'any' && needed === 'any')
  })
  if (satisfied) return null

  return { vehicle: needed, foods: dry.map((d) => d.food) }
}

/**
 * Tirar este item deixaria a refeição sem veículo?
 *
 * Existe por causa da variação da semana: o motor de troca não sabe que o "leite
 * desnatado" do café da manhã é o que dissolve o whey, e trocou-o por "ovo mexido"
 * — devolvendo ao usuário exatamente o prato seco que a geração tinha consertado.
 * Item que sustenta o veículo não entra no sorteio da troca.
 */
export function isVehicleLoadBearing(meal: CoherenceMeal, index: number): boolean {
  const items = Array.isArray(meal?.items) ? meal.items : []
  const target = items[index]
  if (!target || !isLiquidVehicle(target.food)) return false
  const without = { ...meal, items: items.filter((_, i) => i !== index) }
  return missingVehicleOf(without) !== null
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
        message: missing.vehicle === 'creamy'
          ? `"${mealName}" tem ${missing.foods.join(' e ')} sem uma base láctea. Inclua leite ou iogurte como item da refeição — água não prepara cereal nem aveia.`
          : `"${mealName}" tem ${missing.foods.join(' e ')} sem nenhum líquido para preparar. Inclua o líquido (leite, iogurte ou água) como item da refeição.`,
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

/* ── Janela de treino ─────────────────────────────────────────────────────── */

/** Quão longe do fim do treino o pós-treino ainda faz sentido. */
const POST_WORKOUT_MAX_LAG_HOURS = 2.5
/** Quão cedo o pré-treino pode ser servido antes do início. */
const PRE_WORKOUT_MAX_LEAD_HOURS = 2.5

const MEAL_TIME = /^(\d{1,2})[:h](\d{2})/

/** Horas decimais a partir do campo `time` da refeição ("07:30" → 7.5). */
export function parseMealTime(time: unknown): number | null {
  const m = String(time ?? '').trim().match(MEAL_TIME)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null
  return h + min / 60
}

const normalizedName = (meal: CoherenceMeal): string => normalize(meal?.name)
const isPostWorkout = (meal: CoherenceMeal): boolean => /pos.?treino/.test(normalizedName(meal))
const isPreWorkout = (meal: CoherenceMeal): boolean => /pre.?treino/.test(normalizedName(meal))

/**
 * As refeições de treino batem com a hora em que ele TREINA?
 *
 * O gerador entregou "Pós-Treino 18:30" para quem treina às 6 da manhã — e o app
 * tinha o horário real gravado o tempo todo (ver `trainingSchedule`). Um pós-treino
 * onze horas depois do treino não é pós-treino de nada.
 *
 * `schedule` nulo (usuário sem histórico) = nada a verificar: sem rotina conhecida,
 * qualquer horário é palpite legítimo do modelo.
 */
export function findTrainingWindowIssues(
  meals: CoherenceMeal[],
  schedule: { startHour: number; endHour: number; fasted: boolean } | null,
): CoherenceIssue[] {
  if (!schedule) return []
  const list = Array.isArray(meals) ? meals : []
  const issues: CoherenceIssue[] = []
  const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

  list.forEach((meal, mealIndex) => {
    const mealName = String(meal?.name ?? '')
    const at = parseMealTime(meal?.time)
    if (at === null) return

    if (isPostWorkout(meal) && (at < schedule.endHour - 0.5 || at > schedule.endHour + POST_WORKOUT_MAX_LAG_HOURS)) {
      issues.push({
        mealIndex,
        mealName,
        kind: 'training_window',
        message: `"${mealName}" está marcada para ${hhmm(at)}, mas este usuário termina de treinar por volta das ${hhmm(schedule.endHour)}. Ponha o pós-treino logo depois do treino.`,
      })
    }

    if (isPreWorkout(meal)) {
      if (schedule.fasted) {
        issues.push({
          mealIndex,
          mealName,
          kind: 'training_window',
          message: `Remova "${mealName}": este usuário treina em jejum, sem refeição antes do treino.`,
        })
      } else if (at > schedule.startHour + 0.25 || at < schedule.startHour - PRE_WORKOUT_MAX_LEAD_HOURS) {
        issues.push({
          mealIndex,
          mealName,
          kind: 'training_window',
          message: `"${mealName}" está marcada para ${hhmm(at)}, mas o treino começa por volta das ${hhmm(schedule.startHour)}. O pré-treino vem pouco antes disso.`,
        })
      }
    }
  })

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

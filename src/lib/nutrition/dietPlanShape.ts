/**
 * dietPlanShape — forma canônica do plano alimentar salvo.
 *
 * A tabela `student_diet_plans` guarda DOIS formatos, por motivo histórico:
 *  - plano de UM dia: refeições em `meals` (é como o professor prescreve desde
 *    jul/2026, e mudar aquilo quebraria os planos já prescritos);
 *  - plano da SEMANA: `days` com 7 entradas, cada uma com suas refeições.
 *
 * Todo consumidor lê por `planDays()`, que devolve SEMPRE `PlanDay[]` — o plano de
 * um dia vira uma lista de um elemento. Sem isso, cada tela precisaria de um `if`
 * entre os dois formatos, e é exatamente aí que os dois caminhos divergem com o
 * tempo (a família de 14 renderers de série deste repo é o exemplo caro).
 */

export type MacroTotals = { calories: number; protein: number; carbs: number; fat: number }

export interface PlanItem {
  food: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface PlanMeal {
  name: string
  time?: string
  items: PlanItem[]
  totals: MacroTotals
  /**
   * Observação livre do dono do plano sobre ESTA refeição ("bater no
   * liquidificador", "se não tiver frango, atum"). Some quando vazia — nota em
   * branco não precisa ocupar o JSON de 42 refeições de uma semana.
   */
  note?: string
}

export interface PlanDay {
  /** 0 = domingo … 6 = sábado. Plano de um dia não tem dia da semana. */
  weekday?: number
  meals: PlanMeal[]
  totals: MacroTotals
}

export type PlanKind = 'day' | 'week'

/** Linha crua de `student_diet_plans` (só o que a leitura usa). */
export interface DietPlanRow {
  id?: string
  plan_name?: string | null
  plan_kind?: string | null
  meals?: unknown
  days?: unknown
  user_id?: string | null
  created_by?: string | null
  updated_at?: string | null
}

/**
 * Teto da observação por refeição. Uma semana tem ~42 refeições, e o plano
 * inteiro viaja em toda leitura — o limite é o que impede a nota de virar o
 * maior campo do payload.
 */
export const MAX_NOTA_DA_REFEICAO = 300

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const emptyTotals = (): MacroTotals => ({ calories: 0, protein: 0, carbs: 0, fat: 0 })

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export const sumTotals = (parts: Array<{ calories: number; protein: number; carbs: number; fat: number }>): MacroTotals =>
  parts.reduce<MacroTotals>(
    (acc, p) => ({
      calories: acc.calories + num(p.calories),
      protein: acc.protein + num(p.protein),
      carbs: acc.carbs + num(p.carbs),
      fat: acc.fat + num(p.fat),
    }),
    emptyTotals(),
  )

const parseItem = (raw: unknown): PlanItem | null => {
  if (!isRecord(raw)) return null
  const food = String(raw.food ?? '').trim()
  if (!food) return null
  return {
    food: food.slice(0, 120),
    grams: num(raw.grams),
    calories: num(raw.calories),
    protein: num(raw.protein),
    carbs: num(raw.carbs),
    fat: num(raw.fat),
  }
}

const parseMeal = (raw: unknown): PlanMeal | null => {
  if (!isRecord(raw)) return null
  const items = asArray(raw.items).map(parseItem).filter((i): i is PlanItem => i !== null)
  const name = String(raw.name ?? '').trim()
  if (!name && !items.length) return null
  const time = String(raw.time ?? '').trim()
  // ⚠️ Este parser reconstrói a refeição campo a campo, então tudo que não for
  // declarado aqui é DESCARTADO na leitura — e a troca de alimento regrava o
  // plano a partir do que `planDays` devolveu. Sem esta linha, trocar um
  // alimento apagaria a observação da refeição, em silêncio.
  const note = String(raw.note ?? '').trim()
  return {
    name: (name || 'Refeição').slice(0, 60),
    ...(time ? { time } : {}),
    ...(note ? { note: note.slice(0, MAX_NOTA_DA_REFEICAO) } : {}),
    items,
    // Totais SEMPRE recomputados dos itens: trocar um alimento muda o item, e um
    // total gravado junto viraria mentira silenciosa na próxima leitura.
    totals: sumTotals(items),
  }
}

const parseDay = (raw: unknown): PlanDay | null => {
  if (!isRecord(raw)) return null
  const meals = asArray(raw.meals).map(parseMeal).filter((m): m is PlanMeal => m !== null)
  if (!meals.length) return null
  const weekdayRaw = Number(raw.weekday)
  const weekday = Number.isInteger(weekdayRaw) && weekdayRaw >= 0 && weekdayRaw <= 6 ? weekdayRaw : undefined
  return {
    ...(weekday !== undefined ? { weekday } : {}),
    meals,
    totals: sumTotals(meals.map((m) => m.totals)),
  }
}

/**
 * Leitura canônica: devolve os dias do plano, seja ele de um dia ou da semana.
 * Plano de dia → um elemento. Linha vazia/corrompida → lista vazia (a UI mostra
 * o estado vazio em vez de quebrar).
 */
export function planDays(row: DietPlanRow | null | undefined): PlanDay[] {
  if (!row) return []

  const weekDays = asArray(row.days).map(parseDay).filter((d): d is PlanDay => d !== null)
  if (weekDays.length) return weekDays

  const meals = asArray(row.meals).map(parseMeal).filter((m): m is PlanMeal => m !== null)
  if (!meals.length) return []
  return [{ meals, totals: sumTotals(meals.map((m) => m.totals)) }]
}

/** Tipo do plano derivado do CONTEÚDO, não do rótulo — `plan_kind` pode divergir. */
export function planKindOf(row: DietPlanRow | null | undefined): PlanKind {
  return planDays(row).length > 1 ? 'week' : 'day'
}

/** Totais do plano inteiro (soma dos dias). Útil pro cabeçalho da semana. */
export function planTotals(row: DietPlanRow | null | undefined): MacroTotals {
  return sumTotals(planDays(row).map((d) => d.totals))
}

/** Média por dia — o número que faz sentido comparar com a meta diária. */
export function planDailyAverage(row: DietPlanRow | null | undefined): MacroTotals {
  const days = planDays(row)
  if (!days.length) return emptyTotals()
  const total = sumTotals(days.map((d) => d.totals))
  const round1 = (n: number) => Math.round((n / days.length) * 10) / 10
  return {
    calories: round1(total.calories),
    protein: round1(total.protein),
    carbs: round1(total.carbs),
    fat: round1(total.fat),
  }
}

/** O plano é do próprio usuário (editável) ou veio do professor (somente leitura)? */
export function isOwnPlan(row: DietPlanRow | null | undefined, userId: string | null | undefined): boolean {
  const uid = String(userId ?? '').trim()
  if (!uid) return false
  return String(row?.user_id ?? '') === uid && String(row?.created_by ?? '') === uid
}

export const weekdayLabel = (weekday: number | undefined): string =>
  weekday !== undefined && weekday >= 0 && weekday <= 6 ? WEEKDAY_LABELS[weekday] : 'Dia'

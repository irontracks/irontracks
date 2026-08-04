/**
 * mealContext — impede trocar um carbo de almoço por um carbo de café da tarde.
 *
 * A classificação por macro sozinha aceita qualquer carboidrato no lugar de outro,
 * e foi assim que "Macarrão Parafuso" no ALMOÇO virou "Pão Francês com Doce de
 * Leite" (03/08/2026): macro certo, refeição errada. O usuário não come pão com
 * doce de leite no almoço, e uma sugestão dessas queima a confiança na feature.
 *
 * A adequação não vem de lista fixa de "alimento X é café da manhã" — isso não
 * cobriria o que o usuário cadastra, que é justamente o repertório dele. Vem de
 * duas fontes, nesta ordem:
 *
 *  1. O HISTÓRICO: em que refeições ele já comeu aquele alimento. Dado dele, sem
 *     achismo. "Arroz" aparece em Almoço e Janta; "sucrilhos" no café.
 *  2. Quando o alimento não tem histórico (base curada), não bloqueia — só perde a
 *     preferência. Bloquear o desconhecido esvaziaria a troca de quem tem pouco
 *     histórico, que é a maioria.
 */

/**
 * Grupos de refeição. Deliberadamente grosso: separar "almoço" de "janta" não
 * resolveria nada (a comida é a mesma) e criaria escassez de candidatos. O corte
 * que importa é REFEIÇÃO PRINCIPAL × LANCHE/CAFÉ, que é onde a sugestão fica
 * absurda.
 */
export type MealGroup = 'main' | 'snack' | 'unknown'

const MAIN_PATTERNS = [/almoc/, /jant/, /\bceia\b/, /refeicao principal/]
const SNACK_PATTERNS = [
  /cafe/, /lanche/, /manha/, /tarde/, /shake/, /vitamina/,
  /pre.?treino/, /pos.?treino/, /sobremesa/, /colacao/,
]

const normalize = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/** A que grupo pertence o nome de uma refeição ("Café da Manhã", "Almoço"…). */
export function mealGroupOf(mealName: unknown): MealGroup {
  const n = normalize(mealName)
  if (!n) return 'unknown'
  // Lanche antes de principal: "Café da Tarde / Pré-Treino" tem os dois sinais, e
  // o que manda é o lanche. "Ceia" é a exceção — janta tardia, comida de prato.
  if (SNACK_PATTERNS.some((re) => re.test(n))) return 'snack'
  if (MAIN_PATTERNS.some((re) => re.test(n))) return 'main'
  return 'unknown'
}

/** Mapa alimento → grupos de refeição em que o usuário já o comeu. */
export type FoodMealMap = Map<string, Set<MealGroup>>

const foodKey = (name: unknown): string => normalize(name)

/**
 * Constrói o mapa a partir das refeições lançadas. `rows` são linhas de
 * `nutrition_meal_entries` com `food_name` (o nome da REFEIÇÃO) e `items[].label`.
 * Puro — testável sem banco.
 */
export function buildFoodMealMap(
  rows: unknown[],
  stripQuantity: (label: string) => string,
): FoodMealMap {
  const map: FoodMealMap = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const group = mealGroupOf(r.food_name)
    if (group === 'unknown') continue
    const items = Array.isArray(r.items) ? r.items : []
    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue
      const name = stripQuantity(String((raw as Record<string, unknown>).label ?? ''))
      const key = foodKey(name)
      if (!key) continue
      const set = map.get(key) ?? new Set<MealGroup>()
      set.add(group)
      map.set(key, set)
    }
  }
  return map
}

/**
 * O alimento cabe nesse grupo de refeição?
 *
 * `true` quando o histórico diz que sim OU quando não há histórico dele — o
 * desconhecido não é bloqueado, só não ganha preferência. Bloquear esvaziaria a
 * troca de quem tem pouco histórico.
 */
export function fitsMealGroup(foodName: string, group: MealGroup, map: FoodMealMap): boolean {
  if (group === 'unknown') return true
  const known = map.get(foodKey(foodName))
  if (!known || known.size === 0) return true
  return known.has(group)
}

/** O histórico CONFIRMA que este alimento pertence ao grupo? (usado pra ordenar) */
export function isPreferredForMealGroup(foodName: string, group: MealGroup, map: FoodMealMap): boolean {
  if (group === 'unknown') return false
  return map.get(foodKey(foodName))?.has(group) ?? false
}

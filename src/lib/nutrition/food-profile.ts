import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeFoodKey } from './learned-foods'
import { isUsableAsSwapCandidate } from './foodItemSanity'
import { stripQuantityPrefix } from './mealItemFoods'

/**
 * "Memória alimentar" — o repertório REAL do usuário, para o gerador de cardápio
 * montar o plano em cima do que ele já come.
 *
 * ⚠️ Este módulo lia as duas fontes ERRADAS até 04/08/2026, e o efeito era visível
 * no cardápio do usuário. Medido na conta do dono:
 *
 *  1. `nutrition_meal_entries.food_name` é o nome da REFEIÇÃO, não do alimento.
 *     Como a lista era ordenada por frequência, o prompt dizia ao Gemini
 *     "use preferencialmente os alimentos que este usuário já come: Almoço (36×),
 *     Pós treino (21×), Janta (19×), Café da manhã (18×), Café da tarde (16×)…" —
 *     13 dos 20 "alimentos" eram nome de refeição.
 *  2. `nutrition_learned_foods` sem crivo entrega refeição inteira e composto:
 *     "Leite Condensado (lata inteira, 395g)" a 1285 kcal/100 g, "Refeição de Arroz,
 *     Strogonoff e Batata Palha", "Pão Francês com Doce de Leite", "50g de Whey
 *     Protein". Ver `foodItemSanity` para o diagnóstico completo dessa tabela.
 *
 * Com esse input o modelo improvisava, e saíam refeições impossíveis (whey e aveia
 * secos, pão francês no almoço). O motor de TROCA já tinha sido migrado para
 * `nutrition_meal_entries.items` em 03/08 (`mealItemFoods`); o de GERAÇÃO ficou para
 * trás lendo o cru — mesma fonte lixo, outro caminho.
 *
 * Agora a fonte é a mesma da troca: os ITENS das refeições, que o parser já quebrou
 * em alimentos individuais com gramas. E cada alimento carrega EM QUE REFEIÇÕES ele
 * já foi comido — é isso que impede o modelo de pôr pão com doce de leite no almoço,
 * sem precisar de lista fixa de "alimento de café da manhã".
 */

export type FoodProfileItem = {
  name: string
  key: string
  count: number
  /** Refeições em que este alimento já apareceu ("Almoço", "Café da manhã"…). */
  meals: string[]
}

export type FoodProfile = {
  topFoods: FoodProfileItem[]
  /** Quantas refeições lançadas serviram de amostra. */
  sampleCount: number
}

const LOOKBACK_DAYS = 90
const MAX_FOODS = 30
const MAX_ENTRIES = 400

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const normalize = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

/**
 * Rótulo canônico da refeição a partir do que o usuário digitou ("Café da manha",
 * "Pós-treino", "Lache"). Mais fino que o `MealGroup` de `mealContext` de propósito:
 * ali o corte grosso evita escassez de candidatos na troca; aqui é texto de prompt,
 * e "no café da manhã ele come X" orienta o modelo muito melhor que "lanche".
 *
 * Ordem importa: "Café da manhã pós treino" tem os dois sinais e o específico ganha.
 */
const MEAL_LABELS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'Pré-treino', pattern: /pre.?treino/ },
  { label: 'Pós-treino', pattern: /pos.?treino/ },
  { label: 'Almoço', pattern: /almoc/ },
  { label: 'Jantar', pattern: /jant/ },
  { label: 'Ceia', pattern: /\bceia\b/ },
  { label: 'Café da manhã', pattern: /cafe da manh|desjejum|\bmanha\b/ },
  // "lache" é typo real na base do dono — sem rótulo o alimento perderia o contexto
  // de refeição, que é justamente o que orienta o modelo.
  { label: 'Lanche da tarde', pattern: /cafe da tarde|\btarde\b|lanche|\blache\b|colacao|shake|vitamina/ },
  { label: 'Café da manhã', pattern: /\bcafe\b/ },
]

export function mealLabelOf(mealName: unknown): string | null {
  const n = normalize(mealName)
  if (!n) return null
  for (const { label, pattern } of MEAL_LABELS) if (pattern.test(n)) return label
  return null
}

/** Nome que na verdade é rótulo de refeição — nunca é um alimento. */
const looksLikeMealName = (name: string): boolean => {
  const n = normalize(name)
  if (!n) return true
  if (/^refeicao/.test(n)) return true
  // Só bloqueia quando o nome INTEIRO é o rótulo: "café" sozinho é rótulo,
  // "café com leite" é bebida de verdade.
  return MEAL_LABELS.some(({ pattern }) => pattern.test(n) && n.split(/\s+/).length <= 3)
}

/**
 * Extrai o perfil dos itens de refeição. Pura — dá pra testar sem banco, e é onde
 * mora todo o crivo. `rows` são linhas de `nutrition_meal_entries` com `food_name`
 * (nome da refeição) e `items[]` (os alimentos, já com gramas e macros absolutos).
 */
export function profileFromMealRows(rows: unknown[]): FoodProfile {
  const list = Array.isArray(rows) ? rows : []
  const byKey = new Map<string, { item: FoodProfileItem; meals: Map<string, number> }>()

  for (const row of list) {
    if (!isRecord(row)) continue
    const mealLabel = mealLabelOf(row.food_name)
    const items = Array.isArray(row.items) ? row.items : []

    for (const raw of items) {
      if (!isRecord(raw)) continue
      const name = stripQuantityPrefix(String(raw.label ?? '')).slice(0, 60)
      if (!name || looksLikeMealName(name)) continue

      const grams = num(raw.grams)
      if (grams <= 0) continue
      const factor = 100 / grams
      const candidate = {
        name,
        kcal: num(raw.calories) * factor,
        protein: num(raw.protein) * factor,
        carbs: num(raw.carbs) * factor,
        fat: num(raw.fat) * factor,
      }
      // Mesmo crivo do motor de troca: sem composto, sem densidade impossível, sem
      // quantidade no nome. Um item que não serve de substituto também não serve de
      // ingrediente de cardápio — "125 g de Pão Francês com Doce de Leite" é
      // inexecutável nos dois casos.
      if (!isUsableAsSwapCandidate(candidate)) continue

      const key = normalizeFoodKey(name)
      if (!key || key.length < 2) continue

      const entry = byKey.get(key)
      if (entry) {
        entry.item.count += 1
        if (mealLabel) entry.meals.set(mealLabel, (entry.meals.get(mealLabel) ?? 0) + 1)
      } else {
        const meals = new Map<string, number>()
        if (mealLabel) meals.set(mealLabel, 1)
        byKey.set(key, { item: { name, key, count: 1, meals: [] }, meals })
      }
    }
  }

  const topFoods = [...byKey.values()]
    .map(({ item, meals }) => ({
      ...item,
      meals: [...meals.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_FOODS)

  return { topFoods, sampleCount: list.length }
}

/**
 * Perfil do usuário. Resiliente: falha de leitura degrada para perfil vazio em vez
 * de derrubar a geração — sem repertório o prompt cai em "alimentos comuns no
 * Brasil", que é pior que personalizado e MUITO melhor que personalizado com lixo.
 */
export async function buildFoodProfile(supabase: SupabaseClient, userId: string): Promise<FoodProfile> {
  const uid = String(userId || '').trim()
  if (!uid) return { topFoods: [], sampleCount: 0 }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
  try {
    const { data } = await supabase
      .from('nutrition_meal_entries')
      .select('food_name, items')
      .eq('user_id', uid)
      .gte('date', since)
      .not('items', 'is', null)
      .order('date', { ascending: false })
      .limit(MAX_ENTRIES)
    return profileFromMealRows(Array.isArray(data) ? data : [])
  } catch {
    return { topFoods: [], sampleCount: 0 }
  }
}

/**
 * Lista simples para o prompt. Mantida porque nem todo consumidor precisa do recorte
 * por refeição; a geração usa `foodProfileToPromptSections`.
 */
export function foodProfileToPromptList(profile: FoodProfile): string {
  if (!profile?.topFoods?.length) return ''
  return profile.topFoods.map((f) => f.name).filter(Boolean).join(', ')
}

/**
 * O repertório AGRUPADO POR REFEIÇÃO — o formato que resolve "pão francês no
 * almoço". Alimento sem refeição conhecida vai para uma linha própria em vez de ser
 * descartado: ele continua sendo comida do usuário, só não se sabe quando.
 */
export function foodProfileToPromptSections(profile: FoodProfile): string {
  const foods = profile?.topFoods ?? []
  if (!foods.length) return ''

  const byMeal = new Map<string, string[]>()
  const loose: string[] = []
  for (const food of foods) {
    if (!food.meals.length) {
      loose.push(food.name)
      continue
    }
    // Só as duas refeições mais frequentes: um alimento que aparece em tudo não
    // informa nada, e a lista fica ilegível.
    for (const label of food.meals.slice(0, 2)) {
      byMeal.set(label, [...(byMeal.get(label) ?? []), food.name])
    }
  }

  const lines = [...byMeal.entries()].map(([label, names]) => `- ${label}: ${names.join(', ')}`)
  if (loose.length) lines.push(`- Sem refeição definida: ${loose.join(', ')}`)
  return lines.join('\n')
}

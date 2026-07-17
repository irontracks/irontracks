import { foodDatabase } from './food-database'
import type { FoodItem } from './food-database'
import type { MealLog } from './engine'

function normalizeFoodText(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Preserva o decimal com v\u00edrgula ("1,5" \u2192 "1.5") ANTES de tirar a pontua\u00e7\u00e3o \u2014
    // sen\u00e3o "1,5 prato" virava "1 5 prato" e o parser lia qtd=5 (~3,3\u00d7 a mais).
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-zA-Z0-9.\s]/g, ' ') // mant\u00e9m o ponto (separador decimal)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Pre-computed entries from the static food database. */
const normalizedFoodEntries = Object.entries(foodDatabase).map(([key, item]) => {
  const normalizedKey = normalizeFoodText(key)
  return { key, normalizedKey, item, normalizedKeyLength: normalizedKey.length }
})

/**
 * Build the combined food entries list, merging the static database
 * with optional extra foods (e.g. AI-learned foods from Supabase).
 * Extra foods are checked AFTER static entries, so static always wins.
 */
function buildFoodEntries(extraFoods?: Record<string, FoodItem>) {
  if (!extraFoods || Object.keys(extraFoods).length === 0) return normalizedFoodEntries
  const extras = Object.entries(extraFoods).map(([key, item]) => {
    const normalizedKey = normalizeFoodText(key)
    return { key, normalizedKey, item, normalizedKeyLength: normalizedKey.length }
  })
  return [...normalizedFoodEntries, ...extras]
}

// Pesos-por-porção TÍPICOS (g) para alimentos externos (TACO/OFF/aprendidos) que
// não trazem tabela `approx`. Antes tudo caía num fixo de 50 g — "1 prato" e "1
// fatia" pesavam igual, errando muito (fatia de pão ~2× a mais, prato ~5× a menos).
// Continua sendo estimativa (o ideal é o alimento ter `approx`), mas erra bem menos.
const TYPICAL_GRAMS_PER_UNIT: Record<string, number> = {
  colher: 15,
  concha: 80,
  bife: 100,
  fatia: 25,
  pedaco: 50,
  lata: 150,
  scoop: 30,
  xicara: 120,
  copo: 200,
  prato: 250,
  rodela: 20,
  espiga: 100,
  posta: 120,
  medalhao: 80,
  espetinho: 80,
  unidade: 50,
}

/**
 * Ordem de "quão porção é esta unidade", da refeição inteira pro tempero.
 *
 * Serve pra responder "quanto pesa UM/UMA <alimento>?" quando o alimento NÃO declara
 * `unidade`. A base omite `unidade` de propósito em quem não tem unidade natural —
 * "1 picanha" não significa nada —, mas declara em que o alimento É medido:
 *   'arroz cozido'   → { colher: 25, concha: 100, prato: 180 }
 *   'leite integral' → { copo: 250, xicara: 240 }
 *   'atum em lata'   → { lata: 120 }
 * Antes, esse sinal era ignorado e virava 50g de qualquer coisa. Agora pegamos a
 * porção mais representativa que o PRÓPRIO alimento declara — nenhum número novo é
 * inventado aqui, só escolhido entre os que já foram curados.
 */
const SERVING_UNIT_PRIORITY: readonly string[] = [
  'prato',
  'concha',
  'copo',
  'xicara',
  'lata',
  'bife',
  'posta',
  'medalhao',
  'espiga',
  'espetinho',
  'fatia',
  'pedaco',
  'rodela',
  'scoop',
  'colher',
]

/** Peso de uma porção do alimento, escolhido entre as unidades que ele declara. */
function servingGramsOf(approx: Record<string, number> | undefined): number | undefined {
  if (!approx) return undefined
  for (const unit of SERVING_UNIT_PRIORITY) {
    const g = approx[unit]
    if (typeof g === 'number' && Number.isFinite(g) && g > 0) return g
  }
  return undefined
}

type MacroTotals = { p: number; c: number; f: number; kcal: number }

/** A single recognized food line, with its resolved grams and macros. */
export type ParsedMealItem = {
  label: string
  grams: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** Full breakdown of a meal: totals, per-item detail and unrecognized lines. */
export type MealAnalysis = {
  meal: MealLog
  items: ParsedMealItem[]
  unknownLines: string[]
}

/**
 * Like {@link parseInput}, but never throws: returns the recognized totals,
 * the per-item breakdown and the list of lines we couldn't match. Used by the
 * live "simulação" preview so the user sees partial macros while typing.
 */
export function analyzeMeal(text: string, extraFoods?: Record<string, FoodItem>): MealAnalysis {
  const rawText = typeof text === 'string' ? text : ''
  const empty: MealAnalysis = {
    meal: { foodName: 'Refeição', calories: 0, protein: 0, carbs: 0, fat: 0 },
    items: [],
    unknownLines: [],
  }
  if (!rawText.trim()) return empty

  const lines = rawText
    .split('\n')
    .flatMap((l) => String(l || '').split(/\s*\+\s*/g))
    .flatMap((l) => String(l || '').split(/\s*;\s*/g))
    // Comma followed by whitespace is an item separator ("arroz, frango"),
    // but a comma between digits is a decimal ("1,5 colher") — keep that intact.
    .flatMap((l) => String(l || '').split(/,\s+/g))
    // " e " between items is also a separator ("banana e iogurte"). No food in
    // the database contains a standalone " e ", so this is safe.
    .flatMap((l) => String(l || '').split(/\s+e\s+/gi))
    .map((l) => String(l || '').trim())
    .filter(Boolean)
  let mealName = 'Refeição'
  const totals: MacroTotals = { p: 0, c: 0, f: 0, kcal: 0 }
  const unknownLines: string[] = []
  const items: ParsedMealItem[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const rawLine = (line || '').trim()
    if (!rawLine) continue

    if (index === 0 && lines.length > 1 && !/\d/.test(rawLine)) {
      mealName = rawLine
      continue
    }

    const normalizedLine = normalizeFoodText(rawLine)
    if (!normalizedLine) continue

    let qtd = 0
    let foodName = ''
    let unitUsed = 'g'
    let wasApprox = false

    // "ovo(s)" is deliberately NOT a unit here: it's an actual food in the
    // database, and treating it as a unit ate the food name ("2 ovos cozidos"
    // → unit "ovos" + name "cozidos" → no match). Let count-parsing handle it.
    const approxRegex =
      /(\d+(?:[.,]\d+)?)\s*(colher(?:es)?|conchas?|bifes?|fatias?|pedacos?|latas?|scoops?|doses?|unidades?|xicaras?|copos?|pratos?|rodelas?|espigas?|postas?|medalh(?:ao|oes)?|espetinhos?|un|unid)\b/i
    const gramRegex = /(\d+(?:[.,]\d+)?)\s*(g|gr|ml)\b/i
    const countRegex = /^(\d+(?:[.,]\d+)?)\s+(.+)$/i

    const approxMatch = normalizedLine.match(approxRegex)
    const gramMatch = normalizedLine.match(gramRegex)
    const countMatch = normalizedLine.match(countRegex)
    const parseQtd = (raw: string) => Number.parseFloat(String(raw || '0').replace(',', '.'))

    if (approxMatch) {
      qtd = parseQtd(approxMatch[1] || '0')
      const unitRaw = (approxMatch[2] || '').toLowerCase()

      if (unitRaw.startsWith('colher')) unitUsed = 'colher'
      else if (unitRaw.startsWith('concha')) unitUsed = 'concha'
      else if (unitRaw.startsWith('bife')) unitUsed = 'bife'
      else if (unitRaw.startsWith('fatia')) unitUsed = 'fatia'
      else if (unitRaw.startsWith('pedaco')) unitUsed = 'pedaco'
      else if (unitRaw.startsWith('lata')) unitUsed = 'lata'
      else if (unitRaw.startsWith('scoop') || unitRaw.startsWith('dose')) unitUsed = 'scoop'
      else if (unitRaw.startsWith('xicara')) unitUsed = 'xicara'
      else if (unitRaw.startsWith('copo')) unitUsed = 'copo'
      else if (unitRaw.startsWith('prato')) unitUsed = 'prato'
      else if (unitRaw.startsWith('rodela')) unitUsed = 'rodela'
      else if (unitRaw.startsWith('espiga')) unitUsed = 'espiga'
      else if (unitRaw.startsWith('posta')) unitUsed = 'posta'
      else if (unitRaw.startsWith('medalh')) unitUsed = 'medalhao'
      else if (unitRaw.startsWith('espetinho')) unitUsed = 'espetinho'
      else unitUsed = 'unidade'

      foodName = normalizedLine.replace(approxMatch[0] || '', '').replace(' de ', ' ').trim().toLowerCase()
      // When the unit IS the food ("2 ovos" → unit "ovos", empty name), fall back
      // to the unit word as the food name so it still matches the database.
      if (!foodName) foodName = (approxMatch[2] || '').trim().toLowerCase()
      wasApprox = true
    } else if (gramMatch) {
      qtd = parseQtd(gramMatch[1] || '0')
      unitUsed = String(gramMatch[2] || '').toLowerCase() === 'ml' ? 'ml' : 'g'
      foodName = normalizedLine.replace(gramMatch[0] || '', '').replace(' de ', ' ').trim().toLowerCase()
    } else if (countMatch) {
      qtd = parseQtd(countMatch[1] || '0')
      unitUsed = 'unidade'
      foodName = (countMatch[2] || '').replace(' de ', ' ').trim().toLowerCase()
      wasApprox = true
    } else {
      qtd = 1
      unitUsed = 'unidade'
      foodName = normalizedLine
      wasApprox = true
    }

    if (!Number.isFinite(qtd) || qtd <= 0) {
      unknownLines.push(rawLine)
      continue
    }

    const allFoodEntries = buildFoodEntries(extraFoods)
    let matchedItem: FoodItem | null = null
    let dbKeyMatched = ''
    for (const entry of allFoodEntries) {
      if (!entry.normalizedKey) continue
      if (foodName.includes(entry.normalizedKey)) {
        if (!dbKeyMatched || entry.normalizedKeyLength > dbKeyMatched.length) {
          dbKeyMatched = entry.normalizedKey
          matchedItem = entry.item
        }
      }
    }

    if (!matchedItem) {
      unknownLines.push(rawLine)
      continue
    }

    let grams = 0
    if (unitUsed === 'g') {
      grams = qtd
    } else if (unitUsed === 'ml') {
      grams = qtd
    } else if (wasApprox) {
      const approx = matchedItem?.approx
      const gramsPerUnit =
        approx?.[unitUsed] ??
        approx?.[`${unitUsed}s`] ??
        approx?.['unidade'] ??
        // O alimento não declara `unidade`? Então "1 <alimento>" vale uma PORÇÃO dele,
        // medida na unidade que ele mesmo declara — e não 50g cegos. Era daqui que
        // saía "uma pizza grande = 50g = 133 kcal": 'pizza' declara { fatia: 120 } e
        // o parser ignorava. Só vale quando o usuário não nomeou a unidade; se ele
        // disse "2 colheres", respeita-se a colher (acima) mesmo que não exista.
        (unitUsed === 'unidade' ? servingGramsOf(approx) : undefined)
      if (typeof gramsPerUnit === 'number' && Number.isFinite(gramsPerUnit) && gramsPerUnit > 0) {
        grams = qtd * gramsPerUnit
      } else {
        // Último recurso: o alimento não declara NADA (TACO/OFF/customizado só têm
        // valores por 100g). Aqui o chute é inevitável — a UI mostra o peso assumido
        // pra ficar corrigível.
        grams = qtd * (TYPICAL_GRAMS_PER_UNIT[unitUsed] ?? 50)
      }
    } else {
      grams = qtd
    }

    const multiplier = grams / 100
    const p = Math.round(Number(matchedItem.p) * multiplier)
    const c = Math.round(Number(matchedItem.c) * multiplier)
    const f = Math.round(Number(matchedItem.f) * multiplier)
    const kcal = Math.round(Number(matchedItem.kcal) * multiplier)

    const sp = Number.isFinite(p) ? p : 0
    const sc = Number.isFinite(c) ? c : 0
    const sf = Number.isFinite(f) ? f : 0
    const skcal = Number.isFinite(kcal) ? kcal : 0
    totals.p += sp
    totals.c += sc
    totals.f += sf
    totals.kcal += skcal
    items.push({
      label: rawLine,
      grams: Math.max(0, Math.round(Number.isFinite(grams) ? grams : 0)),
      calories: Math.max(0, skcal),
      protein: Math.max(0, sp),
      carbs: Math.max(0, sc),
      fat: Math.max(0, sf),
    })
  }

  return {
    meal: {
      foodName: mealName,
      calories: Math.max(0, Math.round(totals.kcal)),
      protein: Math.max(0, Math.round(totals.p)),
      carbs: Math.max(0, Math.round(totals.c)),
      fat: Math.max(0, Math.round(totals.f)),
    },
    items,
    unknownLines,
  }
}

export function parseInput(text: string, extraFoods?: Record<string, FoodItem>): MealLog {
  const rawText = typeof text === 'string' ? text : ''
  if (!rawText.trim()) throw new Error('nutrition_parser_empty_input')

  const analysis = analyzeMeal(rawText, extraFoods)
  if (analysis.unknownLines.length > 0) {
    throw new Error(`nutrition_parser_unknown_food:${analysis.unknownLines.join('|')}`)
  }
  return analysis.meal
}

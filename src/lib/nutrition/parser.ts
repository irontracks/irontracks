import { foodDatabase } from './food-database'
import type { FoodItem } from './food-database'
import type { MealLog } from './engine'

function normalizeFoodText(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
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
      /(\d+(?:[.,]\d+)?)\s*(colheres?|conchas?|bifes?|fatias?|pedacos?|latas?|scoops?|doses?|unidades?|xicaras?|copos?|pratos?|rodelas?|espigas?|postas?|medalhoes?|espetinhos?|un|unid)\b/i
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
      const gramsPerUnit = approx?.[unitUsed] ?? approx?.[`${unitUsed}s`] ?? approx?.['unidade']
      if (typeof gramsPerUnit === 'number' && Number.isFinite(gramsPerUnit) && gramsPerUnit > 0) {
        grams = qtd * gramsPerUnit
      } else {
        grams = qtd * 50
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

import { foodDatabase } from './food-database'
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

const normalizedFoodEntries = Object.entries(foodDatabase).map(([key, item]) => {
  const normalizedKey = normalizeFoodText(key)
  return { key, normalizedKey, item, normalizedKeyLength: normalizedKey.length }
})

type MacroTotals = { p: number; c: number; f: number; kcal: number }

export function parseInput(text: string): MealLog {
  const rawText = typeof text === 'string' ? text : ''
  if (!rawText.trim()) throw new Error('nutrition_parser_empty_input')

  const lines = rawText
    .split('\n')
    .flatMap((l) => String(l || '').split(/\s*\+\s*/g))
    .flatMap((l) => String(l || '').split(/\s*;\s*/g))
    .map((l) => String(l || '').trim())
    .filter(Boolean)
  let mealName = 'Refeição'
  const totals: MacroTotals = { p: 0, c: 0, f: 0, kcal: 0 }
  const unknownLines: string[] = []

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

    const approxRegex =
      /(\d+(?:[.,]\d+)?)\s*(colheres?|conchas?|bifes?|fatias?|pedacos?|latas?|scoops?|doses?|unidades?|ovos?|xicaras?|copos?|pratos?|rodelas?|espigas?|postas?|medalhoes?|espetinhos?|un|unid)\b/i
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
      else if (unitRaw.startsWith('ovo')) unitUsed = 'unidade'
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

    let matchedItem: any = null
    let dbKeyMatched = ''
    for (const entry of normalizedFoodEntries) {
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

    totals.p += Number.isFinite(p) ? p : 0
    totals.c += Number.isFinite(c) ? c : 0
    totals.f += Number.isFinite(f) ? f : 0
    totals.kcal += Number.isFinite(kcal) ? kcal : 0
  }

  if (unknownLines.length > 0) {
    throw new Error(`nutrition_parser_unknown_food:${unknownLines.join('|')}`)
  }

  return {
    foodName: mealName,
    calories: Math.max(0, Math.round(totals.kcal)),
    protein: Math.max(0, Math.round(totals.p)),
    carbs: Math.max(0, Math.round(totals.c)),
    fat: Math.max(0, Math.round(totals.f)),
  }
}

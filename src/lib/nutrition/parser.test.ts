import { describe, it, expect } from 'vitest'
import { parseInput, analyzeMeal } from './parser'

describe('parseInput', () => {
  // ── Basic parsing ────────────────────────────────────────────
  it('parses grams correctly (e.g. "150g frango")', () => {
    const result = parseInput('150g frango')
    expect(result.foodName).toBe('Refeição')
    expect(result.calories).toBeGreaterThan(0)
    expect(result.protein).toBeGreaterThan(0)
  })

  it('parses multiple items separated by newline', () => {
    const result = parseInput('150g frango\n100g arroz cozido')
    expect(result.calories).toBeGreaterThan(0)
    expect(result.protein).toBeGreaterThan(0)
    expect(result.carbs).toBeGreaterThan(0)
  })

  it('parses items separated by + sign', () => {
    const result = parseInput('100g arroz cozido + 100g feijao cozido')
    expect(result.calories).toBeGreaterThan(0)
    expect(result.carbs).toBeGreaterThan(0)
  })

  it('uses first line as meal name when it has no numbers', () => {
    const result = parseInput('Almoço\n150g frango\n100g arroz cozido')
    expect(result.foodName).toBe('Almoço')
  })

  // ── Unit variations ──────────────────────────────────────────
  it('handles ml unit', () => {
    const result = parseInput('200ml leite integral')
    expect(result.calories).toBeGreaterThan(0)
  })

  it('handles approximate units (colher, fatia, etc)', () => {
    const result = parseInput('2 fatias pao integral')
    expect(result.calories).toBeGreaterThan(0)
  })

  it('handles count-based input (e.g. "2 banana")', () => {
    const result = parseInput('2 banana')
    expect(result.calories).toBeGreaterThan(0)
    expect(result.carbs).toBeGreaterThan(0)
  })

  it('handles single item with no quantity (defaults to 1 unit)', () => {
    const result = parseInput('banana')
    expect(result.calories).toBeGreaterThan(0)
  })

  // ── Specific food categories ─────────────────────────────────
  it('parses protein foods (frango, ovo, atum)', () => {
    const frango = parseInput('100g frango')
    expect(frango.protein).toBeGreaterThan(20) // ~31g per 100g

    const ovo = parseInput('100g ovo')
    expect(ovo.protein).toBeGreaterThan(10)
  })

  it('parses carb foods (arroz cozido, batata doce)', () => {
    const arroz = parseInput('100g arroz cozido')
    expect(arroz.carbs).toBeGreaterThan(20)

    const batata = parseInput('1 batata doce')
    expect(batata.carbs).toBeGreaterThan(10)
  })

  it('parses supplements (whey protein, creatina)', () => {
    const whey = parseInput('1 scoop whey protein')
    expect(whey.protein).toBeGreaterThan(15) // 80g per 100g, 1 scoop ~30g
    expect(whey.calories).toBeGreaterThan(50)
  })

  it('parses beverages (café, suco de laranja)', () => {
    const suco = parseInput('1 copo suco de laranja')
    expect(suco.calories).toBeGreaterThan(50)
    expect(suco.carbs).toBeGreaterThan(10)
  })

  it('parses ready meals (pizza, hamburguer)', () => {
    const pizza = parseInput('2 fatias pizza')
    expect(pizza.calories).toBeGreaterThan(200)
  })

  // ── Edge cases ──────────────────────────────────────────────
  it('throws on empty input', () => {
    expect(() => parseInput('')).toThrow('nutrition_parser_empty_input')
  })

  it('throws on whitespace-only input', () => {
    expect(() => parseInput('   ')).toThrow('nutrition_parser_empty_input')
  })

  it('throws on unrecognized food', () => {
    expect(() => parseInput('100g zorgblatt')).toThrow('nutrition_parser_unknown_food')
  })

  it('error message contains the unrecognized line', () => {
    try {
      parseInput('100g alienfoood123')
      expect.fail('should have thrown')
    } catch (e: unknown) {
      expect((e as Error).message).toContain('100g alienfoood123')
    }
  })

  // ── Macro values ────────────────────────────────────────────
  it('all macro values are non-negative', () => {
    const result = parseInput('200g arroz cozido')
    expect(result.calories).toBeGreaterThanOrEqual(0)
    expect(result.protein).toBeGreaterThanOrEqual(0)
    expect(result.carbs).toBeGreaterThanOrEqual(0)
    expect(result.fat).toBeGreaterThanOrEqual(0)
  })

  it('protein-heavy food has more protein than carbs', () => {
    const result = parseInput('200g frango')
    expect(result.protein).toBeGreaterThan(result.carbs)
  })

  it('carb-heavy food has more carbs than protein', () => {
    const result = parseInput('200g arroz cozido')
    expect(result.carbs).toBeGreaterThan(result.protein)
  })

  // ── Extra learned foods ─────────────────────────────────────
  it('uses extra foods when provided', () => {
    const extraFoods = {
      'açaí premium': { kcal: 250, p: 3, c: 35, f: 12 },
    }
    const result = parseInput('200g açai premium', extraFoods)
    expect(result.calories).toBeGreaterThan(0)
  })

  it('static database takes priority over extra foods', () => {
    const extraFoods = {
      'frango': { kcal: 999, p: 999, c: 999, f: 999 },
    }
    const result = parseInput('100g frango', extraFoods)
    // Static frango has ~165 kcal/100g, not 999
    expect(result.calories).toBeLessThan(300)
  })

  // ── Semicolon separator ─────────────────────────────────────
  it('parses items separated by semicolon', () => {
    const result = parseInput('100g ovo cozido; 100g frango')
    expect(result.calories).toBeGreaterThan(0)
    expect(result.protein).toBeGreaterThan(30) // ovo + frango both high protein
  })

  // ── Comma separator (comma + space splits; decimal comma stays) ──────────
  it('splits items on "comma + space"', () => {
    const combined = parseInput('200g arroz cozido, 200g frango')
    const arroz = parseInput('200g arroz cozido')
    const frango = parseInput('200g frango')
    expect(combined.calories).toBe(arroz.calories + frango.calories)
    expect(combined.protein).toBe(arroz.protein + frango.protein)
  })

  it('does not split a decimal written with a comma (e.g. "1,5 colher")', () => {
    // A comma NOT followed by a space (the decimal in "1,5") must not break the
    // line into two items — it stays a single recognized food entry.
    const a = analyzeMeal('1,5 colher arroz cozido')
    expect(a.items).toHaveLength(1)
    expect(a.unknownLines).toHaveLength(0)
  })
})

describe('analyzeMeal', () => {
  it('returns per-item breakdown plus totals without throwing', () => {
    const a = analyzeMeal('200g arroz cozido, 200g frango')
    expect(a.items).toHaveLength(2)
    expect(a.unknownLines).toHaveLength(0)
    expect(a.meal.calories).toBe(a.items[0]!.calories + a.items[1]!.calories)
  })

  it('reports unknown lines instead of throwing, keeping known partial totals', () => {
    const a = analyzeMeal('200g arroz cozido, 100g zorgblatt')
    expect(a.items).toHaveLength(1)
    expect(a.items[0]!.calories).toBeGreaterThan(0)
    expect(a.unknownLines).toContain('100g zorgblatt')
  })

  it('returns an empty analysis for blank input', () => {
    const a = analyzeMeal('   ')
    expect(a.items).toHaveLength(0)
    expect(a.meal.calories).toBe(0)
  })
})

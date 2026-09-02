import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '../parser'

/**
 * Chave GENÉRICA ('arroz', 'carne', 'batata', 'leite'…) só pode resolver a
 * linha INTEIRA — nunca por casamento de CABEÇA, que é como o resto da base
 * funciona.
 *
 * Medido em 02/09/2026 contra o parser real, depois que a curadoria dos 73
 * genéricos da TACO (ver `food-database.ts`) entrou: a chave genérica de UM
 * ou DOIS tokens sequestrava qualquer frase que começasse com ela.
 *
 *   "100g leite condensado" → casava em 'leite'   → 61 kcal  (real ~321, 5×)
 *   "150g batata doce"      → casava em 'batata'  → a inglesa, não a doce
 *   "150g de arroz com frango" → virava só arroz  → o frango sumia
 *   "100g de bolo de cenoura"  → casava em 'bolo'  → macros de chocolate
 *
 * A correção (`FoodItem.generic` + `matchesEntirePhrase`) faz essas quatro
 * frases ficarem DESCONHECIDAS na base local — como não têm chave própria
 * aqui, a cascata (TACO/IA) resolve com quem lê a frase inteira.
 */
const parse = (t: string) => {
  const a = analyzeMeal(t)
  return { unknown: a.unknownLines, n: a.items.length, label: a.items[0]?.label }
}

describe('genérico não sequestra frase composta', () => {
  it.each([
    '100g leite condensado',
    '150g de arroz com frango',
    '100g de bolo de cenoura',
    '1 pao com ovo',
    '100g de batata frita',
  ])('"%s" fica desconhecido na base local (não cai no genérico)', (text) => {
    const r = parse(text)
    expect(r.unknown).toHaveLength(1)
    expect(r.n).toBe(0)
  })

  it('mas a frase EXATA do genérico continua resolvendo', () => {
    expect(parse('200g arroz').unknown).toEqual([])
    expect(parse('250g arroz branco').unknown).toEqual([])
    expect(parse('100g batata').unknown).toEqual([])
    expect(parse('100g leite').unknown).toEqual([])
  })

  it('e a chave ESPECÍFICA (não genérica) continua vencendo por cabeça, como sempre', () => {
    // 'batata doce' NÃO é genérico — é um alimento próprio com `approx`
    // próprio (e mais longo que 'batata'), então continua casando por CABEÇA
    // normalmente e não fica desconhecido.
    const r = parse('150g batata doce')
    expect(r.unknown).toEqual([])
    expect(r.n).toBe(1)
  })
})

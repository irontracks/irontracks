import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '@/lib/nutrition/parser'

/**
 * Regressão de dois bugs pré-existentes achados na revisão adversarial:
 *  - vírgula decimal em porção era destruída na normalização ("1,5 prato" →
 *    "1 5 prato" → qtd=5, ~3,3× a mais);
 *  - "colher"/"medalhão" no singular não casavam no approxRegex → caíam no
 *    fallback de 50 g em vez do peso da porção.
 * ('frango' tem approx.colher = 30 g no food-database.)
 */
describe('analyzeMeal — vírgula decimal e unidade no singular', () => {
  it('"1,5 colher frango" = 45 g (não 5×30=150 por causa da vírgula)', () => {
    const r = analyzeMeal('1,5 colher frango')
    expect(r.items).toHaveLength(1)
    expect(r.items[0].grams).toBe(45) // 1,5 × approx.colher(30)
  })

  it('"1 colher frango" (singular) usa approx.colher, não o fallback', () => {
    const r = analyzeMeal('1 colher frango')
    expect(r.items[0].grams).toBe(30) // 1 × 30
  })

  it('"2 colheres frango" (plural) continua funcionando', () => {
    const r = analyzeMeal('2 colheres frango')
    expect(r.items[0].grams).toBe(60) // 2 × 30
  })

  it('unidade em gramas com vírgula ("12,5 g frango") = 13 g', () => {
    const r = analyzeMeal('12,5 g frango')
    expect(r.items[0].grams).toBe(13) // arredondado
  })
})

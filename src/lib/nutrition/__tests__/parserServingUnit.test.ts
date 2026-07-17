import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '../parser'
import { foodDatabase } from '../food-database'

/**
 * O chute de 50g por "unidade".
 *
 * Quando o usuário não dá o peso ("1 pizza", ou só "arroz"), o parser precisa saber
 * quanto pesa uma porção. Ele consultava `approx[unidade]` do alimento e, quando o
 * alimento não declarava, caía num TYPICAL_GRAMS_PER_UNIT['unidade'] = 50 — 50g de
 * qualquer coisa.
 *
 * Só que a base NÃO está incompleta: 'arroz cozido' declara {colher, concha, prato},
 * 'leite integral' declara {copo, xicara}, 'pizza' declara {fatia}. Eles OMITEM
 * `unidade` de propósito — "1 picanha" não significa nada. O bug era o parser ignorar
 * esse sinal e chutar, em vez de usar o dado curado que está ali do lado.
 *
 * Regra: sem `unidade` declarada, usa a unidade de PORÇÃO mais representativa que o
 * alimento declara. O chute de 50g fica só pra quem não declara nada (TACO/OFF/custom,
 * que não têm peso por unidade nenhum — ver o relato no PR).
 */
const gramsOf = (text: string) => {
  const a = analyzeMeal(text)
  expect(a.items.length, `"${text}" não foi reconhecido`).toBeGreaterThan(0)
  return a.items[0].grams
}

describe('o bug reportado: "uma pizza grande" pesava 50g', () => {
  it('uma pizza inteira usa o peso de uma pizza, não 50g', () => {
    // 'pizza' declarava só { fatia: 120 } → "uma pizza" caía nos 50g cegos e virava
    // 133 kcal. Uma pizza grande tem ~800g.
    const g = gramsOf('1 pizza')
    expect(g).toBeGreaterThan(500)
    expect(g).not.toBe(50)
  })

  it('a fatia continua certa (não quebrei o que funcionava)', () => {
    expect(gramsOf('1 fatia de pizza')).toBe(120)
    expect(gramsOf('2 fatias de pizza')).toBe(240)
  })

  it('a pizza grande deixa de caber num dia de 2900 kcal', () => {
    const a = analyzeMeal('1 pizza')
    expect(a.meal.calories).toBeGreaterThan(1500) // era 133
  })
})

describe('sem `unidade` declarada, usa a porção que o alimento declara', () => {
  it.each([
    // [texto, mínimo plausível, o que dava antes]
    ['arroz cozido', 100, 'prato/concha, não 50g'],
    ['1 arroz cozido', 100, 'idem'],
    ['leite integral', 200, 'um copo, não 50g'],
    ['1 atum em lata', 100, 'uma lata, não 50g'],
    ['carne moida', 80, 'uma concha, não 50g'],
    ['1 carne bovina', 100, 'um bife, não 50g'],
  ])('%s → porção plausível (%s)', (text, min) => {
    const g = gramsOf(text)
    expect(g).toBeGreaterThanOrEqual(min)
    expect(g).not.toBe(50)
  })

  it('nunca inventa peso: só usa número que o próprio alimento declara', () => {
    // 'arroz cozido': { colher: 25, concha: 100, prato: 180 } → tem que ser um DESSES.
    const declared = Object.values(foodDatabase['arroz cozido'].approx ?? {})
    expect(declared).toContain(gramsOf('arroz cozido'))
  })
})

describe('o que já funcionava não muda', () => {
  it('gramas explícitas mandam sempre', () => {
    expect(gramsOf('150g de frango')).toBe(150)
    expect(gramsOf('200g de arroz cozido')).toBe(200)
    expect(gramsOf('1 pizza')).not.toBe(gramsOf('120g de pizza'))
  })

  it('alimento que DECLARA unidade continua usando a dele', () => {
    expect(gramsOf('1 ovo')).toBe(50)
    expect(gramsOf('5 ovos cozidos')).toBe(250)
    expect(gramsOf('1 pao frances')).toBe(50)
    // frango declara unidade: 100 — não pode virar bife (120).
    expect(gramsOf('1 frango')).toBe(100)
  })

  it('unidades declaradas continuam exatas', () => {
    expect(gramsOf('2 colheres de arroz cozido')).toBe(50)
    expect(gramsOf('1 concha de feijao cozido')).toBe(80)
    expect(gramsOf('1 copo de leite integral')).toBe(250)
  })
})

describe('alimento contável precisa declarar a unidade inteira', () => {
  /**
   * Pego na auditoria: 'abacate' declarava só { colher: 30 }, então "1 abacate"
   * virava 30g/48 kcal — uma colher de abacate. A regra de porção (que usa a menor
   * unidade quando é a única) está certa pra fatia de pão e colher de aveia; falha
   * em fruta contável, que precisa declarar `unidade`.
   */
  it('"1 abacate" é um abacate, não uma colher de abacate', () => {
    const g = gramsOf('1 abacate')
    expect(g).toBeGreaterThan(150)
    expect(gramsOf('1 colher de abacate')).toBe(30) // a colher continua colher
  })
})

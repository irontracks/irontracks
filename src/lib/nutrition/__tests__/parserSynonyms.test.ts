import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '../parser'

/**
 * Sinônimo que faltava na base curada = macro inventado pela IA.
 *
 * Reportado pelo dono, com print: "300g carne picada com molho" foi lançado como
 * 938 kcal / P59 / C0 / G76. A base curada tem 'carne moida' (212 kcal, P26, C0, G11
 * por 100 g) — mas NÃO tinha 'carne picada'. Sem casar a base, a refeição caía na
 * estimativa da IA, que devolveu 76 g de gordura em 300 g de carne: mais que o DOBRO
 * dos 33 g corretos, e 938 kcal em vez de 636.
 *
 * O mesmo acontecia com formato de massa: 'macarrao cozido' existia, "macarrão
 * parafuso" não casava nada e ia pra IA (250 g viraram 299 kcal / 56 g C, ~25% abaixo
 * dos 328 kcal / 62 g reais).
 *
 * A correção é dado, não código: sinônimo da carne + chave genérica de massa. Como o
 * parser elege a MAIOR chave que casa na cabeça do nome, a chave genérica não rouba
 * das específicas.
 */
const parse = (text: string) => {
  const a = analyzeMeal(text)
  return {
    kcal: a.meal.calories,
    p: a.meal.protein,
    c: a.meal.carbs,
    f: a.meal.fat,
    unknown: a.unknownLines,
    n: a.items.length,
  }
}

describe('o caso reportado: carne picada', () => {
  it('"300g carne picada com molho" casa a base — G 33, não os 76 da IA', () => {
    const r = parse('300g carne picada com molho')
    expect(r.n).toBe(1)
    expect(r.unknown).toHaveLength(0) // não cai na IA
    // 300 g × (212 kcal, P26, C0, G11)/100 g
    expect(r.kcal).toBe(636)
    expect(r.p).toBe(78)
    expect(r.f).toBe(33)
    // o valor errado que a IA devolvia
    expect(r.f).not.toBe(76)
    expect(r.kcal).not.toBe(938)
  })

  it('"carne picada" bate exatamente com "carne moida" (é o mesmo alimento)', () => {
    const picada = parse('200g carne picada')
    const moida = parse('200g carne moida')
    expect(picada).toEqual(moida)
  })
})

describe('formatos de macarrão', () => {
  it('"250g macarrão parafuso" casa a base — 328 kcal, não os 299 da IA', () => {
    const r = parse('250g macarrão parafuso')
    expect(r.unknown).toHaveLength(0)
    // 250 g × (131 kcal, P5, C25, G1.1)/100 g
    expect(r.kcal).toBe(328)
    expect(r.c).toBe(63)
    expect(r.kcal).not.toBe(299)
  })

  it('outros formatos também casam (penne, espaguete, talharim)', () => {
    for (const nome of ['penne', 'espaguete', 'talharim', 'parafuso']) {
      const r = parse(`100g ${nome}`)
      expect(r.unknown, `"${nome}" não casou`).toHaveLength(0)
      expect(r.kcal).toBe(131)
    }
  })

  it('a chave genérica NÃO rouba das específicas (maior chave vence)', () => {
    // 'macarrao integral' (124 kcal) tem que continuar ganhando de 'macarrao' (131).
    const integral = parse('100g macarrao integral')
    expect(integral.kcal).toBe(124)
    const cozido = parse('100g macarrao cozido')
    expect(cozido.kcal).toBe(131)
  })
})

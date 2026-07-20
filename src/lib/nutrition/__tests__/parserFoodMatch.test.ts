import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '../parser'

/**
 * Dois bugs que faziam o parser servir o alimento ERRADO, em silêncio.
 *
 * A) `.replace(' de ', ' ')` sem âncora. Existia pra tirar o conector que sobra depois
 *    da quantidade ("2 fatias de pão" → " de pão" → "pão"), mas String.replace sem
 *    âncora troca a primeira ocorrência onde quer que esteja — e comia o " de " que é
 *    parte do NOME.
 * B) Match por substring (`foodName.includes(key)`): chave curta casava dentro de
 *    palavra maior.
 */
const parse = (t: string) => {
  const a = analyzeMeal(t)
  return {
    grams: a.items[0]?.grams,
    kcal: a.items[0]?.calories,
    n: a.items.length,
    unknown: a.unknownLines,
  }
}

describe('A) alimento com " de " no nome', () => {
  it('"1 clara de ovo" é clara, NÃO ovo inteiro', () => {
    // "clara de ovo" → "clara ovo" → não casava 'clara de ovo', mas casava 'ovo'.
    // 78 kcal e 6g de gordura fantasma num staple de bodybuilding.
    const r = parse('1 clara de ovo')
    expect(r.grams).toBe(33)
    expect(r.kcal).toBeLessThan(25)
  })

  it('"3 claras de ovo" escala a clara, não o ovo', () => {
    expect(parse('3 claras de ovo').grams).toBe(99)
  })

  it('"1 pao de queijo" deixa de rejeitar a refeição inteira', () => {
    const r = parse('1 pao de queijo')
    expect(r.unknown).toEqual([])
    expect(r.grams).toBeGreaterThan(0)
  })

  it.each([
    'carne de porco',
    'lombo de porco',
    'grao de bico',
    'pao de forma',
    'oleo de coco',
    'agua de coco',
    'castanha de caju',
    'pasta de amendoim',
    'suco de laranja',
  ])('"1 %s" resolve', (food) => {
    expect(parse(`1 ${food}`).unknown).toEqual([])
  })

  it('o conector ainda é removido quando é conector mesmo', () => {
    // Aqui o " de " sobra da quantidade e PRECISA sair.
    expect(parse('2 fatias de pao integral').grams).toBe(60)
    expect(parse('100g de frango').grams).toBe(100)
    expect(parse('1 unidade de pao de queijo').unknown).toEqual([])
  })
})

describe('B) chave curta não rouba palavra maior', () => {
  it('"macarrao" NÃO é maçã', () => {
    // 'maca' era substring de 'macarrao' → macarrão virava 78 kcal de maçã.
    const r = parse('macarrao')
    expect(r.kcal).not.toBe(78)
    // A base GANHOU a chave genérica 'macarrao' (131 kcal) — antes ela não existia e este
    // teste fixava o "não reconhece, manda pra IA" como o comportamento honesto possível.
    // Agora resolve local como massa, que é melhor: sem custo de IA e sem o erro que ela
    // cometia nos formatos ("macarrão parafuso" virava 299 kcal em vez de 328). O que este
    // teste protege — macarrão nunca ser MAÇÃ — segue valendo, e agora com valor curado.
    expect(r.unknown).toEqual([])
    // Sem quantidade, o parser usa a porção declarada: 'macarrao' tem prato = 200 g,
    // logo 200 g × 131 kcal/100 g = 262 (e não uma maçã de 78).
    expect(r.kcal).toBe(262)
  })

  it('"macarrao cozido" continua casando o macarrão', () => {
    const r = parse('200g de macarrao cozido')
    expect(r.grams).toBe(200)
    expect(r.kcal).toBeGreaterThan(200)
  })

  it('a maçã continua sendo maçã', () => {
    expect(parse('1 maca').kcal).toBeGreaterThan(0)
    expect(parse('2 macas').n).toBe(1)
  })

  it('plural continua casando (o que a borda de palavra poderia ter quebrado)', () => {
    expect(parse('5 ovos cozidos').grams).toBe(250)
    expect(parse('2 bananas').n).toBe(1)
    expect(parse('3 laranjas').n).toBe(1)
  })

  it('casar a chave dentro de uma FRASE continua valendo (é o desejado)', () => {
    // Palavra inteira ≠ frase inteira: "frango com alho" tem que casar 'frango'.
    // Isso é diferente de 'maca' casar DENTRO de "macarrao".
    expect(parse('150g de frango com alho').grams).toBe(150)
    expect(parse('150g de frango com alho').kcal).toBeGreaterThan(0)
  })

  it('a chave mais específica ganha da genérica', () => {
    // 'ovo' e 'ovo cozido' casam ambas em "ovo cozido"; a maior vence.
    expect(parse('1 ovo cozido').grams).toBe(50)
    expect(parse('1 omelete').grams).toBe(120) // e não casa 'ovo'
  })
})

describe('o que já funcionava não muda', () => {
  it.each([
    ['150g de frango', 150],
    ['1 ovo', 50],
    ['5 ovos cozidos', 250],
    ['1 pizza', 800],
    ['2 fatias de pizza', 240],
    ['1,5 colher de arroz cozido', 38],
    ['1 copo de leite integral', 250],
  ])('%s → %ig', (text, grams) => {
    expect(parse(text).grams).toBe(grams)
  })

  it('múltiplos alimentos seguem inteiros', () => {
    const a = analyzeMeal('200g de frango e 100g de arroz cozido')
    expect(a.items).toHaveLength(2)
  })
})

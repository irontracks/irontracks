import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '../parser'

/**
 * "Coxa e sobrecoxa" é UM corte, não dois alimentos — reportado pelo dono
 * (print real): "200g Coxa e sobrecoxa sem osso sem pele grelhado" saía como
 * DOIS itens (886 kcal, com a coxa sozinha valendo 320 e a sobrecoxa 182,
 * ambos com dados errados — ver `foodDatabase` para a correção dos macros).
 *
 * A causa era o split cego de " e " em `parser.ts` — o comentário ali dizia
 * "nenhum alimento da base contém um ' e ' solitário", e isso já era falso:
 * `legumes e salada` (bloco "Pratos prontos") virava dois itens pelo mesmo
 * motivo, silenciosamente, desde que o split existe.
 *
 * A correção (`separarPorConectorE`) só deixa de separar em DUAS situações:
 * nome composto conhecido, ou qualificador (sem osso/pele/gordura/…) do lado
 * direito. Fora disso, " e " separa como sempre.
 */
const parse = (t: string) => {
  const a = analyzeMeal(t)
  return { n: a.items.length, unknown: a.unknownLines, grams: a.items[0]?.grams, kcal: a.items[0]?.calories }
}

describe('corte composto — o corte é UM item', () => {
  it('o caso exato reportado pelo dono: "200g Coxa e sobrecoxa sem osso sem pele grelhado"', () => {
    const r = parse('200g Coxa e sobrecoxa sem osso sem pele grelhado')
    expect(r.n).toBe(1)
    expect(r.unknown).toEqual([])
    expect(r.grams).toBe(200)
    // 200g × (200 kcal/100g, o macro do corte composto) = 400
    expect(r.kcal).toBe(400)
  })

  it('DOIS qualificadores separados por " e " continuam sendo UM item', () => {
    // "sem pele" e "sem osso" nesta ordem, ligados pelo próprio conector " e ".
    const r = parse('200g Coxa e sobrecoxa sem pele e sem osso')
    expect(r.n).toBe(1)
    expect(r.unknown).toEqual([])
    expect(r.grams).toBe(200)
  })

  it('a chave "legumes e salada" volta a ser alcançável (era código morto)', () => {
    const r = parse('100g legumes e salada')
    expect(r.n).toBe(1)
    expect(r.unknown).toEqual([])
  })

  it.each([
    ['200g sobrecoxa e coxa', 200],
    ['200g coxa e sobrecoxa de frango', 200],
    ['100g file de coxa e sobrecoxa', 100],
    ['100g file de coxa e sobrecoxa de frango', 100],
  ])('%s → um item de %ig', (text, grams) => {
    const r = parse(text)
    expect(r.n).toBe(1)
    expect(r.unknown).toEqual([])
    expect(r.grams).toBe(grams)
  })
})

describe('não-regressão: " e " continua separando quando SÃO dois alimentos', () => {
  it('"ovo e banana" continua sendo DOIS itens', () => {
    const r = parse('1 ovo e 1 banana')
    expect(r.n).toBe(2)
    expect(r.unknown).toEqual([])
  })

  it('"ovo e banana", sem quantidade repetida, também separa', () => {
    const r = parse('ovo e banana')
    expect(r.n).toBe(2)
    expect(r.unknown).toEqual([])
  })

  it('"arroz e feijão" continua sendo DOIS itens', () => {
    const r = parse('100g de arroz cozido e 100g de feijao cozido')
    expect(r.n).toBe(2)
    expect(r.unknown).toEqual([])
  })

  it('"200g de frango e 100g de arroz" continua funcionando (o caso já coberto)', () => {
    const r = parse('200g de frango e 100g de arroz cozido')
    expect(r.n).toBe(2)
    expect(r.unknown).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '@/lib/nutrition/parser'

/**
 * O conectivo de posse ("de", "da", "do") é OPCIONAL no casamento.
 *
 * Ninguém fala com ele: o dono digitou "200g filé sobrecoxa sem pele grelhado"
 * (02/09/2026) e a chave 'file de sobrecoxa' não casou. E o efeito não parou em
 * "não reconheceu": em "filé coxa e sobrecoxa" a chave COMPOSTA também deixou de
 * casar, então o separador de itens quebrou a frase, sobrou "sobrecoxa" solta e
 * ela casou assumindo 110 g — 256 kcal em silêncio, no lugar de 400.
 */
const kcal = (t: string) => analyzeMeal(t).items[0]?.calories ?? null
const itens = (t: string) => analyzeMeal(t).items.length

describe('conectivo opcional — o caso do dono', () => {
  it('"filé sobrecoxa" vale o mesmo que "filé de sobrecoxa"', () => {
    expect(kcal('200g filé sobrecoxa sem pele grelhado')).toBe(kcal('200g filé de sobrecoxa sem pele grelhado'))
    expect(kcal('200g filé sobrecoxa')).toBe(466)
  })

  it('sem o conectivo, o corte composto continua sendo UM item — e não 256 kcal de sobra', () => {
    expect(itens('200g filé coxa e sobrecoxa')).toBe(1)
    expect(kcal('200g filé coxa e sobrecoxa')).toBe(400)
    expect(kcal('200g filé coxa e sobrecoxa')).toBe(kcal('200g filé de coxa e sobrecoxa'))
  })

  it('vale para a classe, não só para o frango', () => {
    expect(kcal('100g pao queijo')).toBe(kcal('100g pao de queijo'))
    expect(kcal('2 claras ovo')).toBe(kcal('2 claras de ovo'))
  })
})

describe('não afrouxou o que os guards anteriores travam', () => {
  it.each([
    ['100g leite condensado', 'chave genérica não pode sequestrar frase composta'],
    ['150g de arroz com frango', 'prato composto não vira ingrediente'],
    ['100g de batata frita', 'quem resolve preparo é a TACO'],
  ])('%s continua fora da base local (%s)', (frase) => {
    expect(analyzeMeal(frase).unknownLines).toHaveLength(1)
  })

  it('"ovo e banana" continua sendo DOIS itens', () => {
    expect(itens('ovo e banana')).toBe(2)
  })

  it('a frase original do dono segue como um item só', () => {
    expect(itens('200g Coxa e sobrecoxa sem pele e sem osso')).toBe(1)
    expect(kcal('200g Coxa e sobrecoxa sem pele e sem osso')).toBe(400)
  })
})

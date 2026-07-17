import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '../parser'

/**
 * O PRATO perdia pro INGREDIENTE citado na descrição.
 *
 * Reportado pelo dono: "1 esfirra de frango com requeijão" lançou 39 kcal · P1 C0 G4
 * — que é uma COLHER DE REQUEIJÃO. A esfirra tem 224.
 *
 * Causa: o parser elegia a maior chave que aparecesse em QUALQUER lugar da frase.
 * 'requeijao' tem 9 letras, 'esfirra' tem 7 — e as duas casam em "esfirra de frango
 * com requeijao". O ingrediente mais bem-nomeado ganhava do prato.
 *
 * Em português o substantivo principal vem PRIMEIRO: "esfirra de frango" é uma
 * esfirra; "frango com alho" é frango. Então a cabeça do nome tem prioridade
 * absoluta sobre qualquer match no meio.
 *
 * O fallback (match em qualquer lugar) fica pra quando a cabeça é desconhecida:
 * "arroz com frango" não tem chave 'arroz', e reconhecer o frango ainda é melhor
 * que não reconhecer nada — e evita jogar o usuário free na IA, que é paga.
 */
const parse = (t: string) => {
  const a = analyzeMeal(t)
  return { grams: a.items[0]?.grams, kcal: a.items[0]?.calories, unknown: a.unknownLines }
}

describe('o caso reportado', () => {
  it('"1 esfirra de frango com requeijão" é uma ESFIRRA, não uma colher de requeijão', () => {
    const r = parse('1 esfirra de frango com requeijão')
    expect(r.grams).toBe(80) // a unidade que 'esfirra' declara
    expect(r.kcal).toBe(224) // era 39
  })

  it('o plural do prato também', () => {
    expect(parse('2 esfirras de carne').kcal).toBe(448)
  })

  it('a coxinha é coxinha, não o frango do recheio', () => {
    const r = parse('1 coxinha de frango')
    expect(r.grams).toBe(80)
    expect(r.kcal).toBe(214)
  })
})

describe('a cabeça vence o ingrediente, mesmo sendo chave menor', () => {
  it.each([
    // [entrada, chave que DEVE ganhar, chave maior que perdia]
    ['1 esfirra de frango com requeijão', 'esfirra', 'requeijao'],
    ['1 coxinha de frango', 'coxinha', 'frango'],
    ['1 tapioca com banana', 'tapioca', 'banana'],
  ])('%s → %s (e não %s)', (input, _head, _ingredient) => {
    const r = parse(input)
    expect(r.unknown).toEqual([])
    expect(r.grams).toBeGreaterThan(0)
  })

  it('"1 tapioca com banana" pesa a tapioca (40g), não a banana (80g)', () => {
    expect(parse('1 tapioca com banana').grams).toBe(40)
  })
})

describe('quando a cabeça é desconhecida, o ingrediente ainda salva', () => {
  it('"arroz com frango" reconhece o frango (não existe chave "arroz" sozinha)', () => {
    // Sem o fallback isto viraria não-reconhecido → IA → paywall pro usuário free.
    const r = parse('150g de arroz com frango')
    expect(r.unknown).toEqual([])
    expect(r.grams).toBe(150)
  })
})

describe('o que já funcionava não muda', () => {
  it('"frango com alho" continua frango — aí a cabeça É o frango', () => {
    expect(parse('150g de frango com alho').grams).toBe(150)
    expect(parse('150g de frango com alho').kcal).toBe(248)
  })

  it.each([
    ['1 clara de ovo', 33],
    ['5 ovos cozidos', 250],
    ['1 pizza', 800],
    ['2 fatias de pizza', 240],
    ['150g de frango', 150],
    ['1 pao de queijo', 25],
    ['arroz cozido', 180],
    ['1 copo de leite integral', 250],
  ])('%s → %ig', (text, grams) => {
    expect(parse(text).grams).toBe(grams)
  })

  it('a chave mais específica ainda ganha quando as duas estão na cabeça', () => {
    // 'ovo' e 'ovo cozido' casam ambas no início de "ovo cozido".
    expect(parse('1 ovo cozido').grams).toBe(50)
    expect(parse('100g de macarrao cozido').kcal).toBeGreaterThan(100)
  })
})

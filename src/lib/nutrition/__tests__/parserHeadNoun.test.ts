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

describe('cabeça desconhecida NÃO cai num ingrediente — não há fallback', () => {
  /**
   * Decisão do dono: nada em fallback. Um número plausível e errado é pior que não
   * reconhecer, porque ninguém confere o que parece certo. Sem cabeça conhecida a
   * linha vira unknownLine e a cascata resolve com quem sabe mais: TACO (590
   * alimentos com alias curto) e, no fim, a IA — que lê a frase inteira ("de
   * banana", "com requeijão") e acerta onde uma tabela estática não tem como.
   */
  it.each([
    ['1 sanduiche com bacon', 'virava 15g de bacon = 81 kcal'],
    ['1 torta de banana', 'virava uma banana = 71 kcal'],
  ])('%s → não reconhecido (%s)', (input) => {
    expect(parse(input).unknown).toHaveLength(1)
  })

  it('"arroz com frango" também não vira só frango', () => {
    // Não existe chave 'arroz' sozinha na base local — quem resolve isso é o TACO,
    // que tem o alias curto "arroz". Reconhecer só o frango escondia o arroz.
    expect(parse('150g de arroz com frango').unknown).toHaveLength(1)
  })
})

describe('pratos que ninguém tinha e agora a base local resolve', () => {
  it.each([
    ['1 misto quente', 120],
    ['1 x-burguer', 180],
    ['1 temaki', 150],
    ['1 strogonoff', 200],
    ['1 brigadeiro', 20],
    ['1 pudim', 100],
    ['1 sorvete', 60],
    ['1 panqueca', 100],
    ['1 risoto', 250],
  ])('%s → %ig', (text, grams) => {
    expect(parse(text).grams).toBe(grams)
    expect(parse(text).unknown).toEqual([])
  })

  it('strogonoff usa o número real da TACO (grafia que ela não indexa)', () => {
    // TACO: 'estrogonofe de frango' = 157 kcal/100g. 200g (prato) = 314.
    expect(parse('1 strogonoff').kcal).toBe(314)
  })

  it('o que a TACO JÁ cobre fica fora da base local, pra não sobrescrever dado curado', () => {
    // 'pastel', 'quibe' e 'lasanha' têm alias exato na TACO. A fase local roda ANTES
    // dela, então duplicar aqui trocaria número real por estimativa minha.
    for (const t of ['1 pastel de queijo', '1 quibe', '1 lasanha de frango']) {
      expect(parse(t).unknown).toHaveLength(1)
    }
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

import { describe, it, expect } from 'vitest'
import { isRoleCompatible } from '../mealCoherence'
import { swapFood, type SwapCandidate } from '../foodSwap'

/**
 * Classe de macro certa, papel no prato errado.
 *
 * Os dois casos vieram do plano da semana gerado em produção (04/08/2026), depois
 * que os problemas de líquido já estavam corrigidos:
 *
 *   Sábado, café da manhã:  pão francês 100 g  →  doce de leite tirol 105 g
 *   Quinta, jantar:         patinho moído 200 g →  whey growth 95 g
 *
 * Nos dois o `classifyFood` acertou (carbo por carbo, proteína por proteína). O que
 * faltava era perguntar se o candidato pode OCUPAR AQUELE LUGAR.
 */

const cand = (name: string, kcal: number, protein: number, carbs: number, fat: number): SwapCandidate =>
  ({ name, kcal, protein, carbs, fat, source: 'learned' })

describe('doce concentrado não vira base de refeição', () => {
  it('doce no lugar de pão é recusado', () => {
    expect(isRoleCompatible('Pão francês', 'doce de leite tirol', false)).toBe(false)
  })

  it('doce no lugar de doce continua valendo', () => {
    expect(isRoleCompatible('Doce de leite', 'geleia de morango', false)).toBe(true)
  })

  it('o caso real do sábado: pão francês não vira 105 g de doce de leite', () => {
    const pao = { food: 'Pão francês', grams: 100, calories: 274, protein: 8, carbs: 58, fat: 3 }
    const doce = cand('doce de leite tirol', 260, 5, 45, 6)
    expect(swapFood(pao, [doce], { mealGroup: 'snack' })).toBeNull()
    // Com um carbo de verdade na lista, a troca volta a acontecer.
    expect(swapFood(pao, [doce, cand('biscoito de arroz', 380, 8, 80, 3)], { mealGroup: 'snack' })).not.toBeNull()
  })
})

describe('suplemento em pó não vira o prato do almoço/jantar', () => {
  it('whey no lugar do patinho, no jantar, é recusado', () => {
    expect(isRoleCompatible('Patinho moído', 'whey growth', true)).toBe(false)
  })

  it('no lanche a mesma troca é permitida', () => {
    expect(isRoleCompatible('Patinho moído', 'whey growth', false)).toBe(true)
  })

  it('pó por pó vale até em refeição principal', () => {
    expect(isRoleCompatible('Whey growth', 'proteína de soja isolada', true)).toBe(true)
  })

  it('o caso real da quinta: patinho não vira 95 g de whey no jantar', () => {
    const patinho = { food: 'Patinho moído', grams: 200, calories: 266, protein: 44, carbs: 0, fat: 10 }
    const whey = cand('whey growth', 380, 76, 8, 5)
    expect(swapFood(patinho, [whey], { mealGroup: 'main' })).toBeNull()
    expect(swapFood(patinho, [whey, cand('peito de frango', 165, 31, 0, 4)], { mealGroup: 'main' })).not.toBeNull()
  })
})

describe('a regra é estreita — não pode esvaziar a troca', () => {
  it('trocas normais seguem passando', () => {
    for (const [de, para] of [
      ['Arroz branco', 'macarrão parafuso'],
      ['Peito de frango', 'patinho moído'],
      ['Abacate', 'castanha de caju'],
      ['Banana', 'mamão'],
    ] as const) {
      expect(isRoleCompatible(de, para, true)).toBe(true)
      expect(isRoleCompatible(de, para, false)).toBe(true)
    }
  })
})

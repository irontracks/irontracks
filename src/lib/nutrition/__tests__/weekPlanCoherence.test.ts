import { describe, it, expect } from 'vitest'
import { buildWeekFromDay } from '../weekPlan'
import { liquidKindOf, missingVehicleOf, isVehicleLoadBearing } from '../mealCoherence'
import { isCondiment, isPreparedPlate, isUsableAsSwapCandidate } from '../foodItemSanity'
import type { SwapCandidate } from '../foodSwap'
import type { PlanMeal } from '../dietPlanShape'

/**
 * A variação da semana DESFAZIA a coerência que a geração garantia.
 *
 * Verificado no app (simulador iOS, 04/08/2026) sobre um plano recém-gerado: o dia
 * base saiu certo — "Leite desnatado · Whey · Sucrilhos · Pão" — e a terça, derivada
 * pelo motor de troca, virou "ovo mexido · Whey · Sucrilhos · Pão". O motor trocou
 * justamente o LEITE, porque para ele leite é só mais um item de macro parecido.
 *
 * Três defeitos distintos saíram desse mesmo plano, e cada um tem seu bloco abaixo.
 */

const cand = (name: string, kcal: number, protein: number, carbs: number, fat: number): SwapCandidate =>
  ({ name, kcal, protein, carbs, fat, source: 'learned' })

describe('1. a troca não pode levar embora o líquido da refeição', () => {
  const cafe: PlanMeal = {
    name: 'Café da Manhã',
    items: [
      { food: 'Leite desnatado', grams: 250, calories: 88, protein: 8, carbs: 12, fat: 0 },
      { food: 'Whey protein Growth', grams: 30, calories: 115, protein: 24, carbs: 2, fat: 1 },
      { food: 'Sucrilhos sem açúcar', grams: 40, calories: 148, protein: 3, carbs: 33, fat: 1 },
      { food: 'Pão francês', grams: 50, calories: 143, protein: 4, carbs: 29, fat: 1 },
    ],
    totals: { calories: 494, protein: 40, carbs: 76, fat: 4 },
  }

  it('o leite é reconhecido como estrutural nessa refeição', () => {
    expect(isVehicleLoadBearing(cafe, 0)).toBe(true)
    // O pão não é: tirá-lo não deixa o whey seco.
    expect(isVehicleLoadBearing(cafe, 3)).toBe(false)
  })

  it('nenhum dos 7 dias fica com o whey seco', () => {
    // "ovo mexido" é o candidato REAL que substituiu o leite em produção.
    const candidatos = [
      cand('ovo mexido', 155, 13, 1, 11),
      cand('iogurte natural', 61, 3.5, 4.7, 3.3),
      cand('arroz branco', 130, 3, 28, 0.3),
      cand('batata', 86, 2, 20, 0.1),
      cand('frango', 165, 31, 0, 4),
    ]
    const days = buildWeekFromDay([cafe], candidatos)
    expect(days).toHaveLength(7)
    for (const day of days) {
      expect(missingVehicleOf(day.meals[0]!)).toBeNull()
    }
  })

  it('o item do veículo continua intacto em todos os dias', () => {
    // Os macros são os REAIS do plano de produção. Leite desnatado tem 36% das kcal
    // em proteína, então `classifyFood` o põe em `protein` — a mesma classe do ovo
    // mexido, e é exatamente por isso que a troca aconteceu. Um candidato de outra
    // classe faria o caso passar por acidente (o swap recusa classe diferente).
    const days = buildWeekFromDay([cafe], [cand('ovo mexido', 155, 13.2, 1.3, 11.2)])
    for (const day of days) {
      expect(day.meals[0]!.items.some((i) => i.food === 'Leite desnatado')).toBe(true)
      // O tamanho é o que separa a TRAVA do reparo: se o leite saísse, o reparo o
      // devolveria como item NOVO e a refeição teria 5 itens. Sem esta asserção o
      // caso passa verde com a trava removida — os dois mecanismos se sobrepõem.
      expect(day.meals[0]!.items).toHaveLength(4)
    }
  })

  it('sem pó na refeição, o líquido volta a ser trocável (não é regra cega)', () => {
    const lanche: PlanMeal = {
      name: 'Lanche',
      items: [{ food: 'Leite desnatado', grams: 250, calories: 88, protein: 9, carbs: 12, fat: 1 }],
      totals: { calories: 88, protein: 9, carbs: 12, fat: 1 },
    }
    expect(isVehicleLoadBearing(lanche, 0)).toBe(false)
  })
})

describe('2. água não prepara cereal — veículo tem tipo', () => {
  it('leite e iogurte são cremosos; água, suco e café são finos', () => {
    expect(liquidKindOf('Leite desnatado')).toBe('creamy')
    expect(liquidKindOf('Iogurte natural')).toBe('creamy')
    expect(liquidKindOf('Água')).toBe('any')
    expect(liquidKindOf('Suco de laranja')).toBe('any')
    expect(liquidKindOf('Café preto')).toBe('any')
  })

  it('whey com água passa — é assim que se toma', () => {
    const meal = {
      name: 'Ceia',
      items: [
        { food: 'Whey protein', grams: 30, calories: 115, protein: 24, carbs: 2, fat: 1 },
        { food: 'Água', grams: 300, calories: 0, protein: 0, carbs: 0, fat: 0 },
      ],
    }
    expect(missingVehicleOf(meal)).toBeNull()
  })

  it('sucrilhos com água NÃO passa — o caso real da quarta-feira', () => {
    const meal = {
      name: 'Lanche da Tarde',
      items: [
        { food: 'Sucrilhos sem açúcar', grams: 30, calories: 111, protein: 2, carbs: 25, fat: 1 },
        { food: 'Doce de leite', grams: 30, calories: 94, protein: 2, carbs: 16, fat: 2 },
        { food: 'Água', grams: 200, calories: 0, protein: 0, carbs: 0, fat: 0 },
      ],
    }
    expect(missingVehicleOf(meal)?.vehicle).toBe('creamy')
  })

  it('a troca que INTRODUZ um pó é reparada no dia derivado', () => {
    const lanche: PlanMeal = {
      name: 'Lanche da Tarde',
      items: [
        { food: 'Abacate', grams: 150, calories: 240, protein: 3, carbs: 13, fat: 22 },
        { food: 'Água', grams: 200, calories: 0, protein: 0, carbs: 0, fat: 0 },
      ],
      totals: { calories: 240, protein: 3, carbs: 13, fat: 22 },
    }
    // Só um candidato: a granola entra no lugar do abacate e traz o problema junto.
    const days = buildWeekFromDay([lanche], [cand('granola', 471, 10, 64, 20)])
    for (const day of days) {
      expect(missingVehicleOf(day.meals[0]!)).toBeNull()
    }
  })

  it('os totais do dia reparado incluem o que foi acrescentado', () => {
    const ceia: PlanMeal = {
      name: 'Ceia',
      items: [
        { food: 'Abacate', grams: 100, calories: 160, protein: 2, carbs: 9, fat: 15 },
        { food: 'Whey protein', grams: 30, calories: 115, protein: 24, carbs: 2, fat: 1 },
      ],
      totals: { calories: 275, protein: 26, carbs: 11, fat: 16 },
    }
    const days = buildWeekFromDay([ceia], [cand('castanha', 600, 15, 20, 55)])
    for (const day of days) {
      const meal = day.meals[0]!
      const soma = meal.items.reduce((acc, i) => acc + i.calories, 0)
      expect(meal.totals.calories).toBe(soma)
      expect(day.totals.calories).toBe(soma)
    }
  })
})

describe('3. condimento e prato pronto não substituem alimento', () => {
  it.each(['Maionese light', 'Ketchup Heinz', 'Azeite de oliva extra virgem', 'Manteiga', 'Mostarda'])(
    '%s é condimento',
    (n) => expect(isCondiment(n)).toBe(true),
  )

  it.each(['pedaços de pizza de alcatra acebolada', 'Lasanha', 'Strogonoff de carne', 'porção de fritas'])(
    '%s é prato pronto',
    (n) => expect(isPreparedPlate(n)).toBe(true),
  )

  it('alimento de verdade não é confundido com condimento', () => {
    for (const n of ['Abacate', 'Peito de frango grelhado', 'Arroz branco cozido', 'Castanha de caju']) {
      expect(isCondiment(n)).toBe(false)
      expect(isPreparedPlate(n)).toBe(false)
    }
  })

  it('nenhum dos dois entra na lista de substitutos', () => {
    // Os dois casos REAIS: maionese caiu no lugar do abacate (ambos `fat`), e a
    // pizza no lugar do patinho moído (ambos `protein`).
    expect(isUsableAsSwapCandidate({ name: 'maionese light', kcal: 300, protein: 1, carbs: 5, fat: 30 })).toBe(false)
    expect(isUsableAsSwapCandidate({ name: 'pedaços de pizza de alcatra acebolada', kcal: 250, protein: 14, carbs: 25, fat: 10 })).toBe(false)
    expect(isUsableAsSwapCandidate({ name: 'abacate', kcal: 160, protein: 2, carbs: 9, fat: 15 })).toBe(true)
  })

  it('o abacate não vira maionese em nenhum dia da semana', () => {
    const lanche: PlanMeal = {
      name: 'Lanche da Tarde',
      items: [
        { food: 'Abacate', grams: 150, calories: 240, protein: 3, carbs: 13, fat: 22 },
        { food: 'Água', grams: 200, calories: 0, protein: 0, carbs: 0, fat: 0 },
      ],
      totals: { calories: 240, protein: 3, carbs: 13, fat: 22 },
    }
    const candidatos = [cand('maionese light', 300, 1, 5, 30), cand('castanha de caju', 553, 18, 30, 44)]
      .filter((c) => isUsableAsSwapCandidate(c))
    const days = buildWeekFromDay([lanche], candidatos)
    const nomes = days.flatMap((d) => d.meals[0]!.items.map((i) => i.food.toLowerCase()))
    expect(nomes.some((n) => n.includes('maionese'))).toBe(false)
  })
})

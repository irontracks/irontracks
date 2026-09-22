import { describe, it, expect } from 'vitest'
import { ajustarDia } from '../ajusteAutomaticoDoDia'
import type { PlanMeal } from '../dietPlanShape'
import type { MacroTotals } from '../dietPlanShape'

function totals(protein: number, carbs: number, fat: number): MacroTotals {
  return { calories: protein * 4 + carbs * 4 + fat * 9, protein, carbs, fat }
}

function refeicao(name: string, items: Array<{ food: string; grams: number; protein: number; carbs: number; fat: number }>): PlanMeal {
  const itensCompletos = items.map((it) => ({ ...it, calories: it.protein * 4 + it.carbs * 4 + it.fat * 9 }))
  const t = itensCompletos.reduce(
    (acc, it) => ({ calories: acc.calories + it.calories, protein: acc.protein + it.protein, carbs: acc.carbs + it.carbs, fat: acc.fat + it.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
  return { name, items: itensCompletos, totals: t }
}

describe('ajustarDia', () => {
  it('exemplo do dono: sobrou carbo no almoço, a janta (ainda não lançada) absorve', () => {
    const almoco = refeicao('Almoço', [{ food: 'Arroz branco cozido', grams: 200, protein: 5, carbs: 56, fat: 0 }])
    const janta = refeicao('Janta', [
      { food: 'Arroz branco cozido', grams: 200, protein: 5, carbs: 56, fat: 0 },
      { food: 'Carne moída magra', grams: 200, protein: 52, carbs: 0, fat: 10 },
    ])
    // Lançou só 100g de arroz no almoço (metade do carbo planejado)
    const lancamentos = new Map<string, MacroTotals>([['almoco', totals(2.5, 28, 0)]])

    const resultado = ajustarDia([almoco, janta], lancamentos)

    const jantaAjustada = resultado.refeicoes.find((r) => r.name === 'Janta')!
    const arrozDaJanta = jantaAjustada.items.find((i) => i.food === 'Arroz branco cozido')!
    // Sobraram 28g de carbo do almoço (56-28); a janta ganha esse tanto a mais de arroz
    expect(arrozDaJanta.carbs).toBeGreaterThan(56)
    expect(resultado.ajustes.some((a) => a.refeicao === 'Janta' && a.macro === 'carbs')).toBe(true)
  })

  it('refeição JÁ lançada nunca é alterada pelo resultado', () => {
    const almoco = refeicao('Almoço', [{ food: 'Arroz branco cozido', grams: 200, protein: 5, carbs: 56, fat: 0 }])
    const janta = refeicao('Janta', [{ food: 'Arroz branco cozido', grams: 200, protein: 5, carbs: 56, fat: 0 }])
    const lancamentos = new Map<string, MacroTotals>([['almoco', totals(2.5, 28, 0)]])

    const resultado = ajustarDia([almoco, janta], lancamentos)

    const almocoNoResultado = resultado.refeicoes.find((r) => r.name === 'Almoço')!
    expect(almocoNoResultado.items).toEqual(almoco.items)
    expect(almocoNoResultado.totals).toEqual(almoco.totals)
  })

  it('sem refeição com item compatível para absorver: reporta como não absorvido', () => {
    // Arroz sem proteína/gordura, de propósito — isola o saldo em carboidrato só.
    const almoco = refeicao('Almoço', [{ food: 'Arroz branco cozido', grams: 200, protein: 0, carbs: 56, fat: 0 }])
    // Janta só tem proteína e gordura — nenhum item de carboidrato
    const janta = refeicao('Janta', [{ food: 'Carne moída magra', grams: 200, protein: 52, carbs: 0, fat: 10 }])
    const lancamentos = new Map<string, MacroTotals>([['almoco', totals(0, 28, 0)]])

    const resultado = ajustarDia([almoco, janta], lancamentos)

    const jantaNoResultado = resultado.refeicoes.find((r) => r.name === 'Janta')!
    expect(jantaNoResultado.items).toEqual(janta.items)
    expect(resultado.saldoNaoAbsorvido.carbs).toBeGreaterThan(0)
  })

  it('sem nenhuma refeição pendente hoje: nada muda, tudo vira saldo não absorvido', () => {
    const almoco = refeicao('Almoço', [{ food: 'Arroz branco cozido', grams: 200, protein: 5, carbs: 56, fat: 0 }])
    const lancamentos = new Map<string, MacroTotals>([['almoco', totals(2.5, 28, 0)]])

    const resultado = ajustarDia([almoco], lancamentos)

    expect(resultado.refeicoes).toEqual([almoco])
    expect(resultado.saldoNaoAbsorvido.carbs).toBeCloseTo(28, 0)
  })

  it('teto de variação: item não dobra de tamanho por um desvio gigante', () => {
    const almoco = refeicao('Almoço', [{ food: 'Arroz branco cozido', grams: 500, protein: 12, carbs: 140, fat: 0 }])
    const janta = refeicao('Janta', [{ food: 'Arroz branco cozido', grams: 50, protein: 1, carbs: 14, fat: 0 }])
    // Não lançou NADA no almoço — sobram os 140g de carbo inteiros
    const lancamentos = new Map<string, MacroTotals>([['almoco', totals(0, 0, 0)]])

    const resultado = ajustarDia([almoco, janta], lancamentos)

    const jantaAjustada = resultado.refeicoes.find((r) => r.name === 'Janta')!
    const arroz = jantaAjustada.items.find((i) => i.food === 'Arroz branco cozido')!
    // O item da janta (14g de carbo, bem menor que o excedente de 140g) não pode
    // crescer sem limite — o teto trava bem abaixo do que absorveria tudo.
    expect(arroz.carbs).toBeLessThan(56) // menos que 4x o original (56 = 14*4)
    expect(resultado.saldoNaoAbsorvido.carbs).toBeGreaterThan(0)
  })

  it('macros independentes: proteína e carboidrato ajustam itens diferentes na mesma refeição', () => {
    const almoco = refeicao('Almoço', [
      { food: 'Arroz branco cozido', grams: 200, protein: 5, carbs: 56, fat: 0 },
      { food: 'Peito de frango grelhado', grams: 150, protein: 45, carbs: 0, fat: 3 },
    ])
    const janta = refeicao('Janta', [
      { food: 'Batata doce cozida', grams: 150, protein: 2, carbs: 30, fat: 0 },
      { food: 'Carne moída magra', grams: 150, protein: 39, carbs: 0, fat: 7 },
    ])
    // Comeu metade do arroz E metade do frango
    const lancamentos = new Map<string, MacroTotals>([['almoco', totals(22.5, 28, 1.5)]])

    const resultado = ajustarDia([almoco, janta], lancamentos)
    const jantaAjustada = resultado.refeicoes.find((r) => r.name === 'Janta')!
    const batata = jantaAjustada.items.find((i) => i.food === 'Batata doce cozida')!
    const carne = jantaAjustada.items.find((i) => i.food === 'Carne moída magra')!

    expect(batata.carbs).toBeGreaterThan(30)
    expect(carne.protein).toBeGreaterThan(39)
  })

  it('desvio pequeno (arredondamento) não gera ajuste — abaixo do piso de relevância', () => {
    const almoco = refeicao('Almoço', [{ food: 'Arroz branco cozido', grams: 200, protein: 5, carbs: 56, fat: 0 }])
    const janta = refeicao('Janta', [{ food: 'Arroz branco cozido', grams: 200, protein: 5, carbs: 56, fat: 0 }])
    // Lançou praticamente igual ao plano (diferença de 0,5g de carbo)
    const lancamentos = new Map<string, MacroTotals>([['almoco', totals(5, 55.5, 0)]])

    const resultado = ajustarDia([almoco, janta], lancamentos)
    expect(resultado.ajustes).toEqual([])
  })
})

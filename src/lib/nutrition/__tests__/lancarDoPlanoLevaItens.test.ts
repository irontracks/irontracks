import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { planMealToLogItems } from '@/lib/nutrition/planMealItems'
import type { PlanMeal } from '@/lib/nutrition/dietPlanShape'

/**
 * Lançar refeição do plano tem que levar os ALIMENTOS, não só o total.
 *
 * O defeito (relatado pelo dono em 02/09/2026): o jantar da dieta semanal
 * chegava ao diário como UM item chamado "Jantar" com `grams: 0`, e item sem
 * gramas não ganha campo de quantidade — a refeição ficava impossível de
 * editar.
 */
const meal = (): PlanMeal => ({
  name: 'Jantar',
  items: [
    { food: 'Patinho moído', grams: 200, calories: 266, protein: 54, carbs: 0, fat: 6 },
    { food: 'Legumes cozidos', grams: 200, calories: 70, protein: 4, carbs: 14, fat: 1 },
  ],
  totals: { calories: 336, protein: 58, carbs: 14, fat: 7 },
})

describe('planMealToLogItems', () => {
  it('converte cada alimento do plano em item do diário, com as gramas', () => {
    const itens = planMealToLogItems(meal())
    expect(itens).toHaveLength(2)
    expect(itens[0]).toEqual({ label: 'Patinho moído', grams: 200, calories: 266, protein: 54, carbs: 0, fat: 6 })
    // O que torna a linha EDITÁVEL depois é justamente `grams > 0`.
    expect(itens.every((i) => i.grams > 0)).toBe(true)
  })

  it('a soma dos itens é o total da refeição — card e diário não podem discordar', () => {
    const itens = planMealToLogItems(meal())
    expect(itens.reduce((s, i) => s + i.calories, 0)).toBe(meal().totals.calories)
    expect(itens.reduce((s, i) => s + i.protein, 0)).toBe(meal().totals.protein)
  })

  it('item sem nome não vira linha muda no diário', () => {
    const itens = planMealToLogItems({ items: [{ food: '   ', grams: 100, calories: 50, protein: 1, carbs: 2, fat: 0 }] })
    expect(itens).toEqual([])
  })

  it('plano vazio ou malformado devolve lista vazia, sem estourar', () => {
    expect(planMealToLogItems(null)).toEqual([])
    expect(planMealToLogItems(undefined)).toEqual([])
    expect(planMealToLogItems({ items: [] })).toEqual([])
  })
})

describe('fiação — guard de CLASSE: toda tela que lança do plano passa os itens', () => {
  // O próximo a chamar `applyGeneratedMealAction` a partir de um cardápio vai
  // esquecer, exatamente como as três telas esqueceram. O guard mira na
  // CHAMADA, não no nome do arquivo: tela nova reprova até passar os itens.
  const TELAS = [
    'src/components/dashboard/nutrition/MyDietPlan.tsx',
    'src/components/dashboard/nutrition/PrescribedDietPlan.tsx',
    'src/components/dashboard/nutrition/DietGenerator.tsx',
  ]

  it.each(TELAS)('%s passa planMealToLogItems na chamada', (arquivo) => {
    const src = readFileSync(arquivo, 'utf8')
    const i = src.indexOf('applyGeneratedMealAction(')
    expect(i, 'a chamada precisa existir — se sumiu, o guard perdeu o alvo').toBeGreaterThan(-1)
    // Fatia a chamada por parênteses balanceados: janela fixa atravessaria para
    // o código seguinte e passaria verde por acidente.
    let profundidade = 0
    let fim = i + 'applyGeneratedMealAction'.length
    for (; fim < src.length; fim++) {
      if (src[fim] === '(') profundidade++
      else if (src[fim] === ')') { profundidade--; if (profundidade === 0) break }
    }
    const chamada = src.slice(i, fim + 1)
    expect(chamada).not.toBe('')
    expect(chamada, 'lançar cardápio sem os itens grava um bloco único que ninguém edita').toMatch(/planMealToLogItems\(/)
  })

  it('a action repassa os itens ao trackMeal', () => {
    const src = readFileSync('src/app/(app)/dashboard/nutrition/actions.ts', 'utf8')
    const i = src.indexOf('export async function applyGeneratedMealAction')
    const corpo = src.slice(i, src.indexOf('export async function', i + 10))
    expect(corpo).not.toBe('')
    expect(corpo).toMatch(/trackMeal\(userId, mealLog, resolvedDateKey, safeItems/)
  })
})

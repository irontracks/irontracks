import { describe, it, expect } from 'vitest'
import { reescalarPlanItem, refeicaoParaLancamento, QUANTIDADE_MAXIMA_G } from '../ajusteDoLancamento'
import type { PlanItem, PlanMeal } from '../dietPlanShape'

function item(food: string, grams: number, protein: number, carbs: number, fat: number): PlanItem {
  return { food, grams, calories: protein * 4 + carbs * 4 + fat * 9, protein, carbs, fat }
}

function meal(name: string, items: PlanItem[]): PlanMeal {
  const totals = items.reduce(
    (acc, it) => ({ calories: acc.calories + it.calories, protein: acc.protein + it.protein, carbs: acc.carbs + it.carbs, fat: acc.fat + it.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
  return { name, items, totals }
}

describe('reescalarPlanItem', () => {
  it('escala todos os macros na mesma proporção', () => {
    const arroz = item('Arroz branco cozido', 100, 3, 28, 0)
    const dobrado = reescalarPlanItem(arroz, 200)
    expect(dobrado.grams).toBe(200)
    expect(dobrado.carbs).toBe(56)
    expect(dobrado.protein).toBe(6)
    expect(dobrado.food).toBe('Arroz branco cozido') // nome nunca muda por aqui
  })

  it('trava no teto de sanidade em vez de aceitar porção absurda', () => {
    const arroz = item('Arroz branco cozido', 100, 3, 28, 0)
    const gigante = reescalarPlanItem(arroz, 999999)
    expect(gigante.grams).toBe(QUANTIDADE_MAXIMA_G)
  })

  it('item sem gramas (grams<=0) não tem base para escalar — volta intacto', () => {
    const semDensidade = item('Item legado', 0, 5, 5, 5)
    expect(reescalarPlanItem(semDensidade, 200)).toEqual(semDensidade)
  })

  it('novoValor inválido (0, negativo, NaN) devolve o item intacto — nunca zera a refeição', () => {
    const arroz = item('Arroz branco cozido', 100, 3, 28, 0)
    expect(reescalarPlanItem(arroz, 0)).toEqual(arroz)
    expect(reescalarPlanItem(arroz, -50)).toEqual(arroz)
    expect(reescalarPlanItem(arroz, NaN)).toEqual(arroz)
  })
})

describe('refeicaoParaLancamento', () => {
  it('sem nenhum ajuste, devolve a refeição como veio', () => {
    const janta = meal('Janta', [item('Arroz branco cozido', 200, 5, 56, 0), item('Frango grelhado', 150, 45, 0, 3)])
    const resultado = refeicaoParaLancamento(janta, new Map(), { removidos: new Set(), quantidades: new Map(), adicionados: [] })
    expect(resultado.items).toEqual(janta.items)
    expect(resultado.totals).toEqual(janta.totals)
  })

  it('item removido some da lista final e dos totais', () => {
    const janta = meal('Janta', [item('Arroz branco cozido', 200, 5, 56, 0), item('Frango grelhado', 150, 45, 0, 3)])
    const resultado = refeicaoParaLancamento(janta, new Map(), { removidos: new Set([1]), quantidades: new Map(), adicionados: [] })
    expect(resultado.items).toHaveLength(1)
    expect(resultado.items[0].food).toBe('Arroz branco cozido')
    expect(resultado.totals.protein).toBe(5) // só o arroz — os 45g de proteína do frango saíram
  })

  it('item reescalado aparece com macros proporcionais nos totais', () => {
    const janta = meal('Janta', [item('Arroz branco cozido', 100, 3, 28, 0)])
    const resultado = refeicaoParaLancamento(janta, new Map(), { removidos: new Set(), quantidades: new Map([[0, 200]]), adicionados: [] })
    expect(resultado.items[0].grams).toBe(200)
    expect(resultado.totals.carbs).toBe(56)
  })

  it('itens adicionados entram na lista e somam nos totais', () => {
    const janta = meal('Janta', [item('Arroz branco cozido', 200, 5, 56, 0)])
    const extra = item('Brócolis cozido', 100, 3, 7, 0)
    const resultado = refeicaoParaLancamento(janta, new Map(), { removidos: new Set(), quantidades: new Map(), adicionados: [extra] })
    expect(resultado.items).toHaveLength(2)
    expect(resultado.items[1]).toEqual(extra)
    expect(resultado.totals.carbs).toBe(63)
  })

  it('reescala age sobre o item já TROCADO por Opção, não sobre o original', () => {
    const janta = meal('Janta', [item('Peito de frango', 100, 30, 0, 3)])
    const opcao = item('Carne moída magra', 100, 26, 0, 8)
    const escolhas = new Map<number, PlanItem>([[0, opcao]])
    const resultado = refeicaoParaLancamento(janta, escolhas, { removidos: new Set(), quantidades: new Map([[0, 200]]), adicionados: [] })
    expect(resultado.items[0].food).toBe('Carne moída magra') // continua sendo a opção
    expect(resultado.items[0].grams).toBe(200)
    expect(resultado.totals.protein).toBe(52) // 26 * 2 — reescalou a carne, não o frango
  })

  it('remoção vence reescala no mesmo índice: item reescalado E removido não aparece', () => {
    const janta = meal('Janta', [item('Arroz branco cozido', 100, 3, 28, 0)])
    const resultado = refeicaoParaLancamento(janta, new Map(), { removidos: new Set([0]), quantidades: new Map([[0, 500]]), adicionados: [] })
    expect(resultado.items).toHaveLength(0)
    expect(resultado.totals).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })
})

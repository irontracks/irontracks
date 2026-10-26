import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A "Opção" acompanha o item que está NA TELA (26/10/2026, print do dono).
 *
 * A Ceia mostrava "Picadinho de boi 20 g · 10 g de proteína" e logo abaixo
 * "Opção: Leite 295 g · 21 g de proteína" — dimensionada para os 40 g do PLANO,
 * antes de o reajuste 🧠 cortar o item pela metade. Escolher a opção lançaria os
 * 295 g. O servidor dimensiona contra o plano; quem traz para a escala da tela é
 * o card, e é a FIAÇÃO dele que estes casos travam (o `opcaoNaEscalaDoItem`
 * sozinho passaria verde com o card lendo a opção crua).
 */

const applyMealMock = vi.fn(async () => ({ ok: true }))
let autoAjuste = false
vi.mock('@/contexts/DialogContext', () => ({
  useDialog: () => ({ confirm: async () => true, alert: async () => undefined }),
}))
vi.mock('@/app/app/(app)/dashboard/nutrition/actions', () => ({
  applyGeneratedMealAction: (...args: unknown[]) => applyMealMock(...(args as [])),
}))
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-teste' } } }) } }),
}))
vi.mock('@/hooks/useUserSettings', () => ({
  useUserSettings: () => ({ settings: { nutritionAutoAdjust: autoAjuste }, save: vi.fn(async () => ({ ok: true })) }),
}))

import MyDietPlan from '../MyDietPlan'

const FRANGO = { food: 'Peito de frango', grams: 180, calories: 297, protein: 56, carbs: 0, fat: 7 }
/** 205 g de patinho para os 56 g de proteína dos 180 g de frango. */
const PATINHO = { food: 'Carne moída magra', grams: 205, calories: 273, protein: 55, carbs: 0, fat: 6 }

const plano = {
  id: 'p1',
  plan_name: 'Minha dieta',
  plan_kind: 'day',
  meals: [
    { name: 'Almoço', items: [FRANGO] },
    { name: 'Janta', items: [FRANGO] },
  ],
  days: null,
}

/** A opção do frango da Janta (refeição 1, item 0), como o servidor a devolve. */
const OPCAO_DA_JANTA = [{ mealIndex: 1, itemIndex: 0, alternative: PATINHO }]

const mockFetch = () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/alternatives')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, alternatives: OPCAO_DA_JANTA }) } as unknown as Response
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, plan: plano }) } as unknown as Response
  }))
}

const abrirJanta = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Janta/ }))
}

describe('opção na escala do item da tela', () => {
  beforeEach(() => { applyMealMock.mockClear(); autoAjuste = false })
  afterEach(() => { vi.unstubAllGlobals() })

  it('sem ajuste nenhum, a opção é a do servidor', async () => {
    mockFetch()
    render(<MyDietPlan dateKey="2026-10-26" canApply />)
    await abrirJanta()
    expect(await screen.findByRole('button', { name: /Trocar por 205g de Carne moída magra/i })).toBeTruthy()
  })

  it('o reajuste 🧠 corta o frango pela metade → a opção corta junto', async () => {
    autoAjuste = true
    mockFetch()
    // Almoço lançado com 28 g de proteína a MAIS: a Janta pendente absorve
    // reduzindo o frango até o piso de 0,5× (90 g).
    render(<MyDietPlan dateKey="2026-10-26" canApply entries={[{ food_name: 'Almoço', calories: 410, protein: 84, carbs: 0, fat: 7 }]} />)
    await abrirJanta()
    const opcao = await screen.findByRole('button', { name: /Trocar por 105g de Carne moída magra/i })
    expect(opcao.textContent).toContain('105g')
    expect(screen.queryByRole('button', { name: /Trocar por 205g/i })).toBeNull()
  })

  it('a quantidade digitada no item também leva a opção junto — e o lançamento grava a porção da tela', async () => {
    mockFetch()
    render(<MyDietPlan dateKey="2026-10-26" canApply />)
    await abrirJanta()
    await screen.findByRole('button', { name: /Trocar por 205g/i })

    fireEvent.change(screen.getByRole('textbox', { name: /Quantidade de Peito de frango/i }), { target: { value: '90' } })
    const opcao = await screen.findByRole('button', { name: /Trocar por 105g de Carne moída magra/i })
    fireEvent.click(opcao)

    fireEvent.click(await screen.findByRole('button', { name: /Lançar refeição/ }))
    await waitFor(() => expect(applyMealMock).toHaveBeenCalled())
    const [meal, , itens] = applyMealMock.mock.calls[0] as unknown as [{ protein: number }, string, { grams: number; label?: string }[]]
    // 105 g de patinho, não os 205 do servidor nem os 90 digitados para o frango.
    expect(Math.round(meal.protein)).toBe(28)
    expect(itens.map((i) => i.grams)).toEqual([105])
  })

  it('item que encolheu para coadjuvante (abaixo de 20 g de proteína) perde a opção', async () => {
    mockFetch()
    render(<MyDietPlan dateKey="2026-10-26" canApply />)
    await abrirJanta()
    await screen.findByRole('button', { name: /Trocar por 205g/i })
    fireEvent.change(screen.getByRole('textbox', { name: /Quantidade de Peito de frango/i }), { target: { value: '50' } })
    await waitFor(() => expect(screen.queryByRole('button', { name: /Trocar por .*Carne moída magra/i })).toBeNull())
  })
})

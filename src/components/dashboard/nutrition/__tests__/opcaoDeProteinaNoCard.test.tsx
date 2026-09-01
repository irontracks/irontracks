import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A segunda opção de proteína, no card (01/09/2026).
 *
 * O plano dizia "Peito de frango 180 g" e ponto: quem quisesse carne vermelha
 * naquele dia tinha que lançar e depois EDITAR o lançamento. Agora a opção aparece
 * embaixo do item e o usuário escolhe ANTES de lançar.
 *
 * ⚠️ O que a suíte não veria de outro jeito é a FIAÇÃO: `alternativaDeProteina`
 * escolhe certo e `refeicaoComEscolhas` soma certo isoladamente, e mesmo assim o
 * diário receberia o frango se o `applyMeal` continuasse lendo a refeição crua do
 * plano. É o defeito de contrato que este repo já pagou várias vezes.
 */

const applyMealMock = vi.fn(async () => ({ ok: true }))
vi.mock('@/contexts/DialogContext', () => ({
  useDialog: () => ({ confirm: async () => true, alert: async () => undefined }),
}))
vi.mock('@/app/(app)/dashboard/nutrition/actions', () => ({
  applyGeneratedMealAction: (...args: unknown[]) => applyMealMock(...(args as [])),
}))

import MyDietPlan from '../MyDietPlan'

const ARROZ = { food: 'Arroz branco cozido', grams: 250, calories: 325, protein: 8, carbs: 70, fat: 1 }
const FRANGO = { food: 'Peito de frango', grams: 180, calories: 297, protein: 56, carbs: 0, fat: 7 }
/** Patinho moído: 205 g para os mesmos 56 g de proteína. */
const PATINHO = { food: 'Carne moída magra', grams: 205, calories: 273, protein: 55, carbs: 0, fat: 6 }

const plano = {
  id: 'p1',
  plan_name: 'Minha dieta',
  plan_kind: 'day',
  meals: [{ name: 'Almoço', items: [ARROZ, FRANGO] }],
  days: null,
}

const mockFetch = (opcoes: unknown[]) => {
  const fn = vi.fn(async (url: string) => {
    if (String(url).includes('/alternatives')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, alternatives: opcoes }) } as unknown as Response
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, plan: plano }) } as unknown as Response
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** A opção do item 1 (o frango) da refeição 0. */
const OPCAO_DO_FRANGO = [{ mealIndex: 0, itemIndex: 1, alternative: PATINHO }]

const cabecalhoDoAlmoco = () => screen.getByRole('button', { name: /Almoço/ })

const abrirAlmoco = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Almoço/ }))
}

describe('opção de proteína no card do plano', () => {
  beforeEach(() => { applyMealMock.mockClear() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('mostra a opção embaixo da carne, com a porção recalculada', async () => {
    mockFetch(OPCAO_DO_FRANGO)
    render(<MyDietPlan dateKey="2026-09-01" canApply />)
    await abrirAlmoco()

    const opcao = await screen.findByRole('button', { name: /Trocar por 205g de Carne moída magra/i })
    expect(opcao.textContent).toContain('Carne moída magra')
    expect(opcao.textContent).toContain('205g')
    expect(opcao.textContent).toContain('273 kcal')
  })

  it('o item que NÃO tem opção não ganha linha nenhuma', async () => {
    mockFetch(OPCAO_DO_FRANGO)
    render(<MyDietPlan dateKey="2026-09-01" canApply />)
    await abrirAlmoco()
    await screen.findByRole('button', { name: /Trocar por 205g/i })
    // O arroz continua com uma linha só: o card oferece a CARNE, não um catálogo.
    expect(screen.queryByRole('button', { name: /Trocar por .* Arroz/i })).toBeNull()
  })

  it('escolher a opção muda os totais que o cabeçalho promete', async () => {
    mockFetch(OPCAO_DO_FRANGO)
    render(<MyDietPlan dateKey="2026-09-01" canApply />)
    await abrirAlmoco()

    // O cabeçalho da REFEIÇÃO — o subtítulo do card fala do PLANO, que a escolha
    // não altera (ela vale para o lançamento de hoje), e por isso não é medido aqui.
    // 325 + 297 = 622 kcal · 64 g P
    expect(cabecalhoDoAlmoco().textContent).toContain('622 kcal · 64g P')
    fireEvent.click(await screen.findByRole('button', { name: /Trocar por 205g/i }))
    // 325 + 273 = 598 kcal · 63 g P
    await waitFor(() => expect(cabecalhoDoAlmoco().textContent).toContain('598 kcal · 63g P'))
  })

  it('LANÇA o que está na tela — o diário recebe a carne, não o frango', async () => {
    mockFetch(OPCAO_DO_FRANGO)
    render(<MyDietPlan dateKey="2026-09-01" canApply />)
    await abrirAlmoco()
    fireEvent.click(await screen.findByRole('button', { name: /Trocar por 205g/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Lançar refeição/ }))

    await waitFor(() => expect(applyMealMock).toHaveBeenCalled())
    const [meal] = applyMealMock.mock.calls[0] as unknown as [{ calories: number; protein: number }]
    expect(meal.calories).toBe(598)
    expect(meal.protein).toBe(63)
  })

  it('sem escolher, lança o plano como está', async () => {
    mockFetch(OPCAO_DO_FRANGO)
    render(<MyDietPlan dateKey="2026-09-01" canApply />)
    await abrirAlmoco()
    fireEvent.click(await screen.findByRole('button', { name: /Lançar refeição/ }))

    await waitFor(() => expect(applyMealMock).toHaveBeenCalled())
    const [meal] = applyMealMock.mock.calls[0] as unknown as [{ calories: number }]
    expect(meal.calories).toBe(622)
  })

  it('a escolha é reversível — tocar de novo volta ao frango', async () => {
    mockFetch(OPCAO_DO_FRANGO)
    render(<MyDietPlan dateKey="2026-09-01" canApply />)
    await abrirAlmoco()
    const opcao = await screen.findByRole('button', { name: /Trocar por 205g/i })
    fireEvent.click(opcao)
    await waitFor(() => expect(opcao.getAttribute('aria-pressed')).toBe('true'))
    fireEvent.click(opcao)
    await waitFor(() => expect(cabecalhoDoAlmoco().textContent).toContain('622 kcal · 64g P'))
  })

  it('o plano não muda: nenhuma escrita sai daqui', async () => {
    const fetchFn = mockFetch(OPCAO_DO_FRANGO)
    render(<MyDietPlan dateKey="2026-09-01" canApply />)
    await abrirAlmoco()
    fireEvent.click(await screen.findByRole('button', { name: /Trocar por 205g/i }))

    // A escolha vale para o lançamento. Trocar o PLANO é o outro botão (o ↻), que
    // chama /swap — misturar as duas faria uma decisão de hoje reescrever a semana.
    const chamadas = fetchFn.mock.calls.map((c) => String(c[0]))
    expect(chamadas.some((u) => u.includes('/swap'))).toBe(false)
  })

  it('sem alternativa nenhuma o card fica como sempre foi', async () => {
    mockFetch([])
    render(<MyDietPlan dateKey="2026-09-01" canApply />)
    await abrirAlmoco()
    expect(await screen.findByText('Peito de frango')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Trocar por/i })).toBeNull()
  })
})

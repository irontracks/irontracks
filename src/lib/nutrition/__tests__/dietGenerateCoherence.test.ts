import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * FIAÇÃO do motor de geração — o guard que os testes de unidade não dão.
 *
 * `mealCoherence` sozinho passando verde não prova nada: já aconteceu neste repo de
 * algoritmo e coletor estarem certos e ninguém ligar os dois (ver "Guard falso",
 * caso 3, no CLAUDE.md). Aqui o Gemini é mockado para devolver EXATAMENTE o cardápio
 * que o dono recebeu em 04/08/2026 e se verifica o que sai do outro lado.
 */

const generateContent = vi.fn()

vi.mock('@/utils/ai/gemini', () => ({
  getGeminiModel: () => ({ generateContent }),
}))

vi.mock('@/utils/env', () => ({
  env: { gemini: { apiKey: 'test-key', fastModelId: 'gemini-2.5-flash' } },
}))

vi.mock('@/utils/ai/userContext', () => ({
  buildUserContextBlock: async () => '[CONTEXTO DO USUÁRIO]\nObjetivo: hipertrofia',
}))

const logWarnRemote = vi.fn()
vi.mock('@/lib/logger', () => ({
  logWarnRemote: (...args: unknown[]) => logWarnRemote(...args),
  logError: vi.fn(),
  logWarn: vi.fn(),
}))

const { generateDietPlan } = await import('../dietGenerate')

/** Refeições lançadas pelo usuário — a fonte do repertório (ver `food-profile`). */
const mealRows = [
  {
    food_name: 'Almoço',
    items: [
      { label: '150g arroz branco', grams: 150, calories: 195, protein: 4, carbs: 42, fat: 1 },
      { label: '200g patinho moído', grams: 200, calories: 320, protein: 44, carbs: 0, fat: 16 },
    ],
  },
  {
    food_name: 'Café da manhã',
    items: [{ label: '250ml leite desnatado', grams: 250, calories: 88, protein: 9, carbs: 12, fat: 1 }],
  },
]

/** Client mínimo: só a cadeia que o `buildFoodProfile` usa. */
function fakeSupabase(rows: unknown[]): SupabaseClient {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'gte', 'not', 'order']) {
    chain[method] = () => chain
  }
  chain.limit = async () => ({ data: rows, error: null })
  return { from: () => chain } as unknown as SupabaseClient
}

/** O café da manhã real: whey e aveia SECOS, sem uma gota de líquido. */
const planoIncoerente = {
  planName: 'Plano Alimentar Cardioprotetor',
  meals: [
    {
      name: 'Café da Manhã',
      time: '07:30',
      items: [
        { food: 'Whey Protein Growth', grams: 30, calories: 120, protein: 24, carbs: 3, fat: 2 },
        { food: 'Aveia em Flocos Inteiros', grams: 40, calories: 155, protein: 5, carbs: 26, fat: 3 },
      ],
    },
    {
      name: 'Almoço',
      time: '12:30',
      items: [
        { food: 'Arroz branco cozido', grams: 250, calories: 325, protein: 7, carbs: 70, fat: 1 },
        { food: 'Patinho moído grelhado', grams: 150, calories: 240, protein: 33, carbs: 0, fat: 12 },
      ],
    },
    {
      name: 'Jantar',
      time: '19:30',
      items: [{ food: 'Peito de frango grelhado', grams: 150, calories: 240, protein: 45, carbs: 0, fat: 5 }],
    },
  ],
}

const planoCoerente = {
  ...planoIncoerente,
  meals: [
    {
      ...planoIncoerente.meals[0]!,
      items: [
        ...planoIncoerente.meals[0]!.items,
        { food: 'Leite desnatado', grams: 200, calories: 70, protein: 7, carbs: 10, fat: 1 },
      ],
    },
    planoIncoerente.meals[1]!,
    planoIncoerente.meals[2]!,
  ],
}

const respondWith = (plan: unknown) => ({ response: { text: async () => JSON.stringify(plan) } })

const targets = { calories: 2600, protein: 200, carbs: 290, fat: 70 }

beforeEach(() => {
  generateContent.mockReset()
  logWarnRemote.mockReset()
})

describe('o prompt recebe o repertório AGRUPADO POR REFEIÇÃO', () => {
  it('manda o alimento sob a refeição em que o usuário o come', async () => {
    generateContent.mockResolvedValue(respondWith(planoCoerente))
    await generateDietPlan(fakeSupabase(mealRows), { sourceUserId: 'u1', targets })

    const prompt = String(generateContent.mock.calls[0]![0])
    expect(prompt).toContain('- Almoço: arroz branco, patinho moído')
    expect(prompt).toContain('- Café da manhã: leite desnatado')
  })

  it('nunca manda nome de refeição como se fosse alimento', async () => {
    generateContent.mockResolvedValue(respondWith(planoCoerente))
    await generateDietPlan(fakeSupabase(mealRows), { sourceUserId: 'u1', targets })

    const prompt = String(generateContent.mock.calls[0]![0])
    // O bug antigo produzia literalmente "…alimentos que este usuário já come:
    // Almoço, Pós treino, Janta, Café da manhã…" — uma lista de rótulos. Aqui a
    // asserção é sobre os ALIMENTOS listados, não sobre a frase: extrai o lado
    // direito de cada linha do repertório e exige que nenhum seja um rótulo.
    const listados = prompt
      .split('\n')
      .filter((l) => l.startsWith('- ') && l.includes(': '))
      .flatMap((l) => l.slice(l.indexOf(': ') + 2).split(', ').map((s) => s.trim().toLowerCase()))

    for (const rotulo of ['almoço', 'janta', 'jantar', 'café da manhã', 'pós treino', 'ceia', 'lanche', 'refeição']) {
      expect(listados).not.toContain(rotulo)
    }
    expect(listados).toContain('arroz branco')
  })

  it('exige o líquido junto do pó, explicitamente', async () => {
    generateContent.mockResolvedValue(respondWith(planoCoerente))
    await generateDietPlan(fakeSupabase(mealRows), { sourceUserId: 'u1', targets })

    const prompt = String(generateContent.mock.calls[0]![0])
    expect(prompt).toMatch(/PÓ ou SECO.*exige um LÍQUIDO/s)
  })
})

describe('cardápio incoerente é devolvido ao modelo antes de virar plano', () => {
  it('plano coerente de primeira NÃO gasta uma segunda chamada', async () => {
    generateContent.mockResolvedValue(respondWith(planoCoerente))
    const out = await generateDietPlan(fakeSupabase(mealRows), { sourceUserId: 'u1', targets })

    expect(generateContent).toHaveBeenCalledTimes(1)
    expect(out.ok && out.plan.repairedMeals).toBe(0)
  })

  it('whey seco dispara UMA retentativa, com o problema apontado', async () => {
    generateContent
      .mockResolvedValueOnce(respondWith(planoIncoerente))
      .mockResolvedValueOnce(respondWith(planoCoerente))

    const out = await generateDietPlan(fakeSupabase(mealRows), { sourceUserId: 'u1', targets })

    expect(generateContent).toHaveBeenCalledTimes(2)
    const retryPrompt = String(generateContent.mock.calls[1]![0])
    expect(retryPrompt).toContain('REPROVADO')
    // Aveia exige base láctea — a mensagem tem que dizer isso, não "algum líquido".
    expect(retryPrompt).toMatch(/"Café da Manhã" tem .* sem uma base láctea/)

    // Corrigido pelo modelo: nada a reparar no servidor.
    expect(out.ok && out.plan.repairedMeals).toBe(0)
    expect(out.ok && out.plan.meals[0]!.items.some((i) => i.food === 'Leite desnatado')).toBe(true)
  })

  it('não entra em laço: no máximo duas chamadas, mesmo insistindo no erro', async () => {
    generateContent.mockResolvedValue(respondWith(planoIncoerente))
    await generateDietPlan(fakeSupabase(mealRows), { sourceUserId: 'u1', targets })
    expect(generateContent).toHaveBeenCalledTimes(2)
  })
})

describe('rede de segurança: o modelo insistiu no erro, o servidor conserta', () => {
  it('o plano entregue ao usuário TEM o líquido, e o reparo é reportado', async () => {
    generateContent.mockResolvedValue(respondWith(planoIncoerente))

    const out = await generateDietPlan(fakeSupabase(mealRows), { sourceUserId: 'u1', targets })
    expect(out.ok).toBe(true)
    if (!out.ok) return

    const cafe = out.plan.meals[0]!
    expect(cafe.items.at(-1)!.food).toBe('Leite desnatado')
    expect(out.plan.repairedMeals).toBe(1)

    // Saída silenciosa em caminho crítico é bomba-relógio — o reparo vai pro Sentry.
    expect(logWarnRemote).toHaveBeenCalledWith(
      'diet-generate.vehicle-repaired',
      expect.any(String),
      expect.objectContaining({ repaired: 1 }),
    )
  })

  it('os totais são recomputados COM o líquido acrescentado', async () => {
    generateContent.mockResolvedValue(respondWith(planoIncoerente))
    const out = await generateDietPlan(fakeSupabase(mealRows), { sourceUserId: 'u1', targets })
    if (!out.ok) throw new Error('esperava plano')

    const cafe = out.plan.meals[0]!
    const somaItens = cafe.items.reduce((acc, i) => acc + i.calories, 0)
    expect(cafe.totals.calories).toBe(somaItens)
    // 120 + 155 do modelo + 70 do leite: o total do dia não ignora o reparo.
    expect(cafe.totals.calories).toBe(345)
  })

  it('as refeições que já estavam certas não são tocadas', async () => {
    generateContent.mockResolvedValue(respondWith(planoIncoerente))
    const out = await generateDietPlan(fakeSupabase(mealRows), { sourceUserId: 'u1', targets })
    if (!out.ok) throw new Error('esperava plano')

    expect(out.plan.meals[1]!.items).toHaveLength(2)
    expect(out.plan.meals[2]!.items).toHaveLength(1)
  })
})

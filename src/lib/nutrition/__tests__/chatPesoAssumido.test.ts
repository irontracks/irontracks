/**
 * O aviso de peso é para o CHUTE, não para o dado que o usuário deu.
 *
 * O prompt do chat mandava, em toda simulação, "OBRIGATÓRIO: cite o PESO
 * ASSUMIDO junto do alimento… e, se parecer irreal, peça o peso certo". A regra
 * existe por um motivo real: quando o alimento não declara quanto pesa uma
 * unidade, o parser cai em 50g — e "uma pizza grande" virava 133 kcal.
 *
 * Só que ela também disparava quando a pessoa tinha ESCRITO o peso. Visto no
 * iPhone em 25/08/2026, para "140g de atum": *"Comendo 140g de atum (que o app
 * assumiu como 140g)…"*. Ruído que mina a confiança no número — e, no mesmo
 * caso, a IA ainda pediu para o usuário "ajustar o peso manualmente".
 */
import { describe, it, expect } from 'vitest'
import { analyzeMeal } from '@/lib/nutrition/parser'
import type { NutritionSnapshot } from '@/lib/nutrition/chatContext'

/** O mesmo formato usado em `chatPrompt.test.ts` — o prompt lê o dia inteiro. */
const SNAP: NutritionSnapshot = {
  today: {
    dateKey: '2026-08-25',
    totals: { calories: 1768, protein: 90, carbs: 200, fat: 30 },
    waterMl: 1000,
    meals: [{ time: '12:30', name: 'Almoço', calories: 700, protein: 50, carbs: 80, fat: 20 }],
  },
  goals: { calories: 2676, protein: 208, carbs: 295, fat: 74, source: 'saved' },
  remaining: { calories: 908, protein: 118, carbs: 95, fat: 44 },
  week: { days: 7, loggedDays: 5, sum: { calories: 14000, protein: 1000, carbs: 1500, fat: 350 }, avg: { calories: 2800, protein: 200, carbs: 300, fat: 70 } },
  month: { days: 30, loggedDays: 20, sum: { calories: 56000, protein: 4000, carbs: 6000, fat: 1400 }, avg: { calories: 2800, protein: 200, carbs: 300, fat: 70 } },
  trends: { kcalAvg7vs30: 0, proteinAvg7vs30: 0 },
  library: [],
  repertoire: [],
} as NutritionSnapshot

describe('parser marca o peso que ELE chutou', () => {
  it('peso em gramas escrito pelo usuário não é assumido', () => {
    const [item] = analyzeMeal('140g de atum sólido ao natural').items
    expect(item.assumedWeight).toBeFalsy()
  })

  it('unidade convertida em gramas É assumida', () => {
    // "2 ovos" → o app é quem decide quanto pesa um ovo.
    const [item] = analyzeMeal('2 ovos cozidos').items
    expect(item.assumedWeight).toBe(true)
  })

  it('medida caseira também é chute do app', () => {
    const [item] = analyzeMeal('1 colher de azeite').items
    expect(item.assumedWeight).toBe(true)
  })
})

describe('prompt do chat', () => {
  const prompt = async (items: Array<{ label: string; grams: number; assumedWeight?: boolean }>) => {
    const { buildReplyPrompt } = await import('@/lib/nutrition/chatPrompt')
    const macro = { add: 10, projected: 100, goal: 200, remaining: 100, over: false }
    return buildReplyPrompt(
      'quanto dá?',
      'x',
      { calories: macro, protein: macro, carbs: macro, fat: macro },
      SNAP,
      items,
    )
  }

  it('com peso do usuário, PROÍBE dizer que o app assumiu', async () => {
    const p = await prompt([{ label: '140g de atum', grams: 140 }])
    expect(p).not.toMatch(/PESO ASSUMIDO PELO APP/)
    expect(p).toMatch(/NÃO diga que o app "assumiu"/)
  })

  it('com peso chutado, o aviso continua OBRIGATÓRIO', async () => {
    const p = await prompt([{ label: '1 pizza grande', grams: 50, assumedWeight: true }])
    expect(p).toMatch(/PESO ASSUMIDO PELO APP/)
    expect(p, 'é este caso que já devolveu "uma pizza grande = 133 kcal"').toMatch(/peça o peso certo/)
  })

  /**
   * "use exatamente estes números" é instrução de FIDELIDADE, e vazou para a
   * resposta como precisão de medição: "você vai adicionar exatamente 36g de
   * proteína". Tabela de alimento é estimativa.
   */
  it('proíbe prometer precisão que o dado não tem', async () => {
    const p = await prompt([{ label: '140g de atum', grams: 140 }])
    expect(p).toMatch(/Nunca diga "exatamente"/)
  })
})

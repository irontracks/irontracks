import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildNutritionSnapshot,
  formatSnapshotForPrompt,
  shiftDateKey,
  type SnapshotGoals,
} from '../chatContext'

const GOALS: SnapshotGoals = { calories: 2900, protein: 215, carbs: 350, fat: 70, source: 'saved' }
const TODAY = '2026-07-16'

/**
 * Mock encadeável: `from(table)` decide o dataset. As três queries do snapshot são
 * distinguidas pela tabela e pelo select (entries de hoje vs. repertório de 30d).
 */
function mockSupabase(opts: {
  todayEntries?: Record<string, unknown>[]
  days?: Record<string, unknown>[]
  repertoire?: Record<string, unknown>[]
}) {
  return {
    from: (table: string) => ({
      select: (cols: string) => {
        const isRepertoire = table === 'nutrition_meal_entries' && !cols.includes('created_at')
        const data = table === 'daily_nutrition_logs'
          ? (opts.days ?? [])
          : isRepertoire
            ? (opts.repertoire ?? [])
            : (opts.todayEntries ?? [])
        const result = Promise.resolve({ data, error: null })
        const chain: Record<string, unknown> = {
          eq: () => chain,
          gte: () => chain,
          lte: () => chain,
          order: () => result,
          then: (res: (v: unknown) => unknown) => result.then(res),
        }
        return chain
      },
    }),
  } as unknown as SupabaseClient
}

describe('shiftDateKey', () => {
  it('desloca dias, atravessando mês e ano', () => {
    expect(shiftDateKey('2026-07-16', -6)).toBe('2026-07-10')
    expect(shiftDateKey('2026-07-16', -29)).toBe('2026-06-17')
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('hoje — os totais vêm das entries CRUAS (paridade com o diário)', () => {
  it('soma as entries do dia, não o agregado arredondado', async () => {
    const snap = await buildNutritionSnapshot(
      mockSupabase({
        todayEntries: [
          { created_at: '2026-07-16T12:00:00Z', food_name: 'Almoço', calories: 700.4, protein: 50.3, carbs: 80, fat: 20 },
          { created_at: '2026-07-16T18:00:00Z', food_name: 'Jantar', calories: 500.3, protein: 40.2, carbs: 40, fat: 15 },
        ],
        // O daily_nutrition_logs diria 1201/91 (arredondado). Não é ele que manda.
        days: [{ date: TODAY, calories: 1201, protein: 91, carbs: 120, fat: 35, water_ml: 500 }],
      }),
      'u1',
      TODAY,
      GOALS,
    )
    expect(snap.today.totals.calories).toBe(1201) // round(1200.7)
    expect(snap.today.totals.protein).toBe(91) // round(90.5)
    expect(snap.today.waterMl).toBe(500)
    expect(snap.today.meals).toHaveLength(2)
    expect(snap.today.meals[0].name).toBe('Almoço')
  })

  it('remaining é meta − consumido, e negativo quando estourou', async () => {
    const snap = await buildNutritionSnapshot(
      mockSupabase({ todayEntries: [{ food_name: 'X', calories: 3000, protein: 250, carbs: 0, fat: 0 }] }),
      'u1',
      TODAY,
      GOALS,
    )
    expect(snap.remaining.calories).toBe(-100)
    expect(snap.remaining.protein).toBe(-35)
    expect(snap.remaining.carbs).toBe(350)
  })

  it('macro sem meta → remaining null (não "faltam -3000")', async () => {
    const snap = await buildNutritionSnapshot(
      mockSupabase({ todayEntries: [{ food_name: 'X', calories: 500, protein: 0, carbs: 0, fat: 0 }] }),
      'u1',
      TODAY,
      { calories: 0, protein: 0, carbs: 0, fat: 0, source: 'default' },
    )
    expect(snap.remaining.calories).toBeNull()
    expect(snap.remaining.protein).toBeNull()
  })

  it('dia vazio não vira NaN', async () => {
    const snap = await buildNutritionSnapshot(mockSupabase({}), 'u1', TODAY, GOALS)
    expect(snap.today.totals).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
    expect(snap.today.meals).toEqual([])
    expect(snap.week.loggedDays).toBe(0)
    expect(snap.trends.kcalAvg7vs30).toBeNull()
  })
})

describe('janelas — loggedDays é o que impede a média mentirosa', () => {
  // 30 dias na janela, mas só 3 lançados.
  const days = [
    { date: '2026-07-16', calories: 3000, protein: 200, carbs: 300, fat: 80 },
    { date: '2026-07-15', calories: 2000, protein: 100, carbs: 200, fat: 60 },
    { date: '2026-06-20', calories: 1000, protein: 60, carbs: 100, fat: 30 }, // fora dos 7 dias
  ]

  it('a média é sobre os dias LANÇADOS, não sobre a janela', async () => {
    const snap = await buildNutritionSnapshot(mockSupabase({ days }), 'u1', TODAY, GOALS)
    expect(snap.week.loggedDays).toBe(2)
    expect(snap.week.sum.calories).toBe(5000)
    expect(snap.week.avg.calories).toBe(2500) // 5000/2 lançados — NÃO 5000/7
    expect(snap.month.loggedDays).toBe(3)
    expect(snap.month.avg.calories).toBe(2000) // 6000/3 — NÃO 6000/30
  })

  it('fatia 7 vs 30 pela data', async () => {
    const snap = await buildNutritionSnapshot(mockSupabase({ days }), 'u1', TODAY, GOALS)
    expect(snap.week.sum.calories).toBe(5000)
    expect(snap.month.sum.calories).toBe(6000)
    expect(snap.week.days).toBe(7)
    expect(snap.month.days).toBe(30)
  })

  it('dia com linha mas tudo zerado não conta como lançado', async () => {
    const snap = await buildNutritionSnapshot(
      mockSupabase({ days: [{ date: TODAY, calories: 0, protein: 0, carbs: 0, fat: 0 }] }),
      'u1',
      TODAY,
      GOALS,
    )
    expect(snap.week.loggedDays).toBe(0)
    expect(snap.week.avg.calories).toBe(0)
  })

  it('tendência = média 7d − média 30d', async () => {
    const snap = await buildNutritionSnapshot(mockSupabase({ days }), 'u1', TODAY, GOALS)
    expect(snap.trends.kcalAvg7vs30).toBe(500) // 2500 − 2000
  })
})

describe('repertório', () => {
  it('agrupa por nome (case-insensitive), ordena por frequência e capa em 10', async () => {
    const repertoire = [
      ...Array.from({ length: 5 }, () => ({ food_name: 'Ovos', calories: 80, protein: 7 })),
      ...Array.from({ length: 3 }, () => ({ food_name: 'ovos', calories: 90, protein: 7 })),
      { food_name: 'Arroz', calories: 200, protein: 4 },
      ...Array.from({ length: 12 }, (_, i) => ({ food_name: `Comida ${i}`, calories: 100, protein: 5 })),
    ]
    const snap = await buildNutritionSnapshot(mockSupabase({ repertoire }), 'u1', TODAY, GOALS)
    expect(snap.repertoire).toHaveLength(10)
    expect(snap.repertoire[0].name).toBe('ovos')
    expect(snap.repertoire[0].count).toBe(8) // 'Ovos' + 'ovos' juntos
    expect(snap.repertoire[0].avgCalories).toBe(84) // round((5*80 + 3*90)/8)
  })

  it('ignora nome vazio', async () => {
    const snap = await buildNutritionSnapshot(
      mockSupabase({ repertoire: [{ food_name: '   ', calories: 10, protein: 1 }] }),
      'u1',
      TODAY,
      GOALS,
    )
    expect(snap.repertoire).toEqual([])
  })
})

describe('formatSnapshotForPrompt', () => {
  const build = () =>
    buildNutritionSnapshot(
      mockSupabase({
        todayEntries: [{ created_at: '2026-07-16T15:00:00Z', food_name: 'Almoço', calories: 700, protein: 50, carbs: 80, fat: 20 }],
        days: [{ date: TODAY, calories: 700, protein: 50, carbs: 80, fat: 20, water_ml: 250 }],
        repertoire: [{ food_name: 'Ovos', calories: 80, protein: 7 }],
      }),
      'user-uuid-secreto',
      TODAY,
      GOALS,
    )

  it('serializa os números prontos pro modelo só ler', async () => {
    const out = formatSnapshotForPrompt(await build())
    expect(out).toContain('700 kcal')
    expect(out).toContain('Falta pra meta: 2200 kcal')
    expect(out).toContain('Almoço')
    expect(out).toContain('ovos')
  })

  it('NÃO vaza userId nem PII', async () => {
    const out = formatSnapshotForPrompt(await build())
    expect(out).not.toContain('user-uuid-secreto')
    expect(out.toLowerCase()).not.toContain('@')
  })

  it('sem meta, avisa o modelo em vez de fingir meta zero', async () => {
    const snap = await build()
    const out = formatSnapshotForPrompt({
      ...snap,
      goals: { calories: 0, protein: 0, carbs: 0, fat: 0, source: 'default' },
      remaining: { calories: null, protein: null, carbs: null, fat: null },
    })
    expect(out).toContain('NÃO definiu meta')
    expect(out).toContain('sem meta')
  })

  it('diz quantos dias foram lançados, pra média nunca soar absoluta', async () => {
    const out = formatSnapshotForPrompt(await build())
    expect(out).toMatch(/de 7 dias lançados|nenhum dia lançado/)
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  aggregateEntriesByDay,
  periodLabel,
  periodRangeText,
  summarizeHistory,
  windowStartDate,
} from '@/lib/nutrition/history'

describe('aggregateEntriesByDay', () => {
  const linhas = [
    { date: '2026-08-14', calories: 500, protein: 40, carbs: 50, fat: 10 },
    { date: '2026-08-14', calories: 700, protein: 55, carbs: 60, fat: 20 },
    { date: '2026-08-16', calories: 300, protein: 30, carbs: 10, fat: 5 },
  ]

  it('soma por dia e conta as refeições', () => {
    const dias = aggregateEntriesByDay(linhas)
    const d14 = dias.find((d) => d.date === '2026-08-14')
    expect(d14).toMatchObject({ calories: 1200, protein: 95, carbs: 110, fat: 30, meals: 2 })
  })

  it('devolve do mais recente para o mais antigo', () => {
    expect(aggregateEntriesByDay(linhas).map((d) => d.date)).toEqual(['2026-08-16', '2026-08-14'])
  })

  it('aceita número em texto com vírgula e ignora linha sem data', () => {
    const dias = aggregateEntriesByDay([
      { date: '2026-08-16', calories: '10,5' as unknown as number },
      { date: '', calories: 999 },
      { date: null, calories: 999 },
    ])
    expect(dias).toHaveLength(1)
    expect(dias[0].calories).toBeCloseTo(10.5)
  })

  it('lista vazia não quebra', () => {
    expect(aggregateEntriesByDay(null)).toEqual([])
  })
})

/**
 * A regra que separa nutrição de treino: dia sem sessão é DESCANSO, dia sem
 * lançamento é ESQUECIMENTO. Dividir a comida de 12 dias por 30 devolveria uma
 * média que ninguém comeu.
 */
describe('summarizeHistory', () => {
  const dias = [
    { date: '2026-08-16', calories: 2400, protein: 180, carbs: 250, fat: 70, meals: 4 },
    { date: '2026-08-15', calories: 2000, protein: 160, carbs: 200, fat: 60, meals: 3 },
  ]

  it('a média divide pelos dias REGISTRADOS, não pela janela', () => {
    const r = summarizeHistory(dias, 30)
    expect(r.avgCalories, '(2400+2000)/2 — não /30').toBe(2200)
    expect(r.avgProtein).toBe(170)
  })

  it('a cobertura viaja junto com a média', () => {
    const r = summarizeHistory(dias, 30)
    expect(r.loggedDays).toBe(2)
    expect(r.windowDays).toBe(30)
  })

  it('janela sem nenhum lançamento não inventa média nem total', () => {
    expect(summarizeHistory([], 7)).toEqual({
      loggedDays: 0,
      excludedDays: 0, windowDays: 7,
      avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0,
      totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0,
    })
  })

  it('devolve o TOTAL da janela, além da média por dia registrado', () => {
    // O story de período mostra os dois: a média se compara com a meta diária,
    // o total responde "quanto no mês" — que foi como o dono leu o card.
    const dias = [
      { date: '2026-08-01', calories: 2000, protein: 150, carbs: 200, fat: 70 },
      { date: '2026-08-02', calories: 2400, protein: 160, carbs: 240, fat: 80 },
    ]
    const r = summarizeHistory(dias, 30)
    expect(r.totalCalories).toBe(4400)
    expect(r.totalProtein).toBe(310)
    expect(r.totalCarbs).toBe(440)
    expect(r.totalFat).toBe(150)
    expect(r.avgCalories).toBe(2200)
  })

  it('média e total saem da MESMA soma — não podem divergir', () => {
    const dias = [
      { date: '2026-08-01', calories: 1999, protein: 0, carbs: 0, fat: 0 },
      { date: '2026-08-02', calories: 2000, protein: 0, carbs: 0, fat: 0 },
      { date: '2026-08-03', calories: 2002, protein: 0, carbs: 0, fat: 0 },
    ]
    const r = summarizeHistory(dias, 30)
    expect(r.totalCalories).toBe(6001)
    expect(r.avgCalories).toBe(Math.round(r.totalCalories / r.loggedDays))
  })
})

describe('rótulo e intervalo do período', () => {
  it('7 e 30 dias têm nome; o resto é a contagem crua', () => {
    expect(periodLabel(7)).toBe('Semana')
    expect(periodLabel(30)).toBe('Mês')
    expect(periodLabel(45), 'inventar nome para 45 dias é pior que dizer 45 dias').toBe('45 dias')
  })

  it('mesmo mês escreve o mês uma vez só', () => {
    expect(periodRangeText('2026-08-16', 7)).toBe('10 – 16 de ago.')
  })

  it('virada de mês nomeia os dois', () => {
    expect(periodRangeText('2026-03-02', 7)).toMatch(/fev.*mar/)
  })
})

describe('windowStartDate', () => {
  it('inclui o próprio dia final na contagem', () => {
    expect(windowStartDate('2026-08-16', 7)).toBe('2026-08-10')
    expect(windowStartDate('2026-08-16', 1)).toBe('2026-08-16')
  })

  it('atravessa a virada do mês', () => {
    expect(windowStartDate('2026-03-02', 30)).toBe('2026-02-01')
  })
})

/**
 * Source-guards. Os dois travam decisões que a auditoria de 16/08/2026 mediu no
 * banco, e que voltariam a ser tomadas "pelo caminho óbvio" por quem chegar
 * depois sem os números.
 */
describe('a fonte do histórico', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('a lista NÃO lê daily_nutrition_logs — ele diverge da tela do dia', () => {
        const modal = read('src/components/dashboard/nutrition/NutritionHistoryModal.tsx')
        const codigo = modal.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
        expect(codigo, 'medido: 3 dias em 61 divergem, até 1050 kcal (dia com agregado e ZERO refeições)')
            .not.toMatch(/daily_nutrition_logs/)
        expect(codigo).toMatch(/nutrition_meal_entries/)
    })

  it('a lista NÃO baixa `items` — é a refeição inteira em jsonb', () => {
    const modal = read('src/components/dashboard/nutrition/NutritionHistoryModal.tsx')
    const select = modal.match(/\.select\(\s*'([^']+)'\s*\)/)
    expect(select, 'o select precisa existir para ser auditado').toBeTruthy()
    const colunas = String(select?.[1] || '').split(',').map((c) => c.trim())
    expect(colunas).not.toContain('items')
    expect(colunas).not.toContain('*')
    expect(colunas).toContain('date')
  })

  it('o erro de leitura não é confundido com "nunca comeu"', () => {
    const modal = read('src/components/dashboard/nutrition/NutritionHistoryModal.tsx')
    expect(modal, 'supabase-js entrega a falha no retorno, não como exceção')
      .toMatch(/if\s*\(\s*error\s*\)/)
  })
})

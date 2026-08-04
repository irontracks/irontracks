import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildWeekFromDay, DAYS_IN_WEEK, WEEK_START_WEEKDAY } from '../weekPlan'
import type { SwapCandidate } from '../foodSwap'
import type { PlanMeal } from '../dietPlanShape'

/**
 * Plano da semana (item 5) derivado de UM dia gerado.
 *
 * Gerar 7 dias na IA seria 7 chamadas pagas por clique, 7 × 1–3 s de espera, e o
 * modelo repetiria o mesmo repertório de qualquer jeito (o prompt sai dos mesmos
 * alimentos do usuário). Aqui é UMA chamada pro dia-base e os outros 6 saem do motor
 * de troca, que já preserva o papel do alimento.
 *
 * A variação é determinística — sem `Math.random()`, que tornaria isto não testável.
 */

const cand = (name: string, kcal: number, protein: number, carbs: number, fat: number): SwapCandidate =>
  ({ name, kcal, protein, carbs, fat, source: 'database' })

const PROTEINAS = [
  cand('frango', 165, 31, 0, 4),
  cand('atum', 116, 26, 0, 1),
  cand('tilapia', 96, 20, 0, 1.7),
  cand('patinho', 133, 27, 0, 3),
  cand('salmao', 208, 20, 0, 13),
]
const CARBOS = [
  cand('arroz cozido', 130, 3, 28, 0.3),
  cand('macarrao cozido', 131, 5, 25, 1.1),
  cand('batata doce', 86, 2, 20, 0.1),
  cand('arroz integral', 124, 3, 26, 1),
]

const meal = (name: string): PlanMeal => ({
  name,
  items: [
    { food: 'Frango', grams: 200, calories: 330, protein: 62, carbs: 0, fat: 8 },
    { food: 'Arroz', grams: 150, calories: 195, protein: 4.5, carbs: 42, fat: 0.5 },
  ],
  totals: { calories: 525, protein: 66.5, carbs: 42, fat: 8.5 },
})

const BASE = [meal('Almoço'), meal('Jantar')]
const ALL = [...PROTEINAS, ...CARBOS]

describe('buildWeekFromDay — 7 dias a partir de um', () => {
  it('devolve a semana inteira, começando na segunda', () => {
    const days = buildWeekFromDay(BASE, ALL)
    expect(days).toHaveLength(DAYS_IN_WEEK)
    expect(days[0].weekday).toBe(WEEK_START_WEEKDAY)
    expect(days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('o dia 0 fica INTACTO — é ele que bate a meta com precisão', () => {
    const days = buildWeekFromDay(BASE, ALL)
    expect(days[0].meals[0].items.map((i) => i.food)).toEqual(['Frango', 'Arroz'])
  })

  it('os outros dias variam de verdade — semana não é o mesmo dia 7 vezes', () => {
    const days = buildWeekFromDay(BASE, ALL)
    const assinaturas = days.map((d) => d.meals.flatMap((m) => m.items.map((i) => i.food)).join('|'))
    expect(new Set(assinaturas).size).toBeGreaterThan(1)
  })

  it('a rotação troca item diferente a cada dia (não insiste sempre no primeiro)', () => {
    const days = buildWeekFromDay(BASE, ALL)
    // dia 1 mexe no item 0; dia 2 no item 1 (2 itens por refeição → alterna).
    expect(days[1].meals[0].items[0].food).not.toBe('Frango')
    expect(days[1].meals[0].items[1].food).toBe('Arroz')
    expect(days[2].meals[0].items[1].food).not.toBe('Arroz')
    expect(days[2].meals[0].items[0].food).toBe('Frango')
  })

  it('não repete o mesmo substituto em dias seguidos do mesmo item', () => {
    const days = buildWeekFromDay(BASE, ALL)
    // Item 0 é trocado nos dias 1, 3 e 5 (rotação de 2 itens).
    const trocas = [days[1], days[3], days[5]].map((d) => d.meals[0].items[0].food)
    expect(new Set(trocas).size).toBe(trocas.length)
  })

  it('a troca preserva a classe — proteína continua proteína a semana toda', () => {
    const days = buildWeekFromDay(BASE, ALL)
    const nomesProteina = new Set(PROTEINAS.map((p) => p.name))
    for (const d of days.slice(1)) {
      const item0 = d.meals[0].items[0].food
      expect(item0 === 'Frango' || nomesProteina.has(item0)).toBe(true)
    }
  })

  it('as calorias do dia ficam perto do dia-base — a meta continua valendo', () => {
    const days = buildWeekFromDay(BASE, ALL)
    const base = days[0].totals.calories
    for (const d of days) {
      expect(Math.abs(d.totals.calories - base) / base).toBeLessThan(0.25)
    }
  })

  it('totais do dia são recomputados dos itens trocados, não herdados', () => {
    const days = buildWeekFromDay(BASE, ALL)
    for (const d of days) {
      const soma = d.meals.reduce((acc, m) => acc + m.items.reduce((a, i) => a + i.calories, 0), 0)
      expect(Math.round(d.totals.calories)).toBe(Math.round(soma))
    }
  })

  it('sem substituto possível o item FICA — dia parecido é melhor que dia furado', () => {
    // Repertório com um único alimento de cada classe: nada pra trocar.
    const days = buildWeekFromDay(BASE, [cand('frango', 165, 31, 0, 4), cand('arroz cozido', 130, 3, 28, 0.3)])
    expect(days).toHaveLength(DAYS_IN_WEEK)
    for (const d of days) {
      expect(d.meals[0].items.map((i) => i.food)).toEqual(['Frango', 'Arroz'])
    }
  })

  it('é determinístico — mesma entrada, mesma semana (nada de Math.random)', () => {
    const a = buildWeekFromDay(BASE, ALL)
    const b = buildWeekFromDay(BASE, ALL)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('entrada vazia devolve lista vazia em vez de 7 dias fantasma', () => {
    expect(buildWeekFromDay([], ALL)).toEqual([])
    expect(buildWeekFromDay(null as unknown as PlanMeal[], ALL)).toEqual([])
  })
})

describe('source-guard: a semana não chama IA nem escapa do plano próprio', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const route = strip(readFileSync('src/app/api/nutrition/diet-plan/week/route.ts', 'utf8'))
  const lib = strip(readFileSync('src/lib/nutrition/weekPlan.ts', 'utf8'))

  it('a rota da semana NÃO chama o gerador de IA — seriam 7 chamadas pagas', () => {
    expect(route).not.toMatch(/generateDietPlan|diet-generate|gemini/i)
    expect(route).toMatch(/buildWeekFromDay/)
  })

  it('grava como week, com os 7 dias na coluna days', () => {
    expect(route).toMatch(/plan_kind: 'week'/)
    expect(route).toMatch(/days: days\.map/)
  })

  it('substitui o plano próprio anterior arquivando, sem apagar', () => {
    expect(route).toMatch(/status: 'archived'/)
    expect(route).toMatch(/\.eq\('created_by', userId\)/)
  })

  it('a derivação é determinística — nada de random no meio', () => {
    expect(lib).not.toMatch(/Math\.random/)
  })
})

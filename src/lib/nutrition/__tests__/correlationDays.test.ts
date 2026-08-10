import { describe, it, expect } from 'vitest'

import { buildCorrelationDays, CORRELATION_WINDOW_DAYS } from '@/lib/nutrition/correlationDays'

/**
 * O heatmap Treino × Nutrição acendia o quadrado no dia errado para quem treina
 * à noite: `workouts.date` é timestamp UTC e o bucketing usava o dia UTC, então
 * às 21h BRT o registro já pertencia ao dia seguinte. O "hoje" da grade sofria
 * do mesmo mal.
 */
// 10/08/2026, 15h em São Paulo (18h UTC).
const AGORA = Date.parse('2026-08-10T18:00:00.000Z')

describe('buildCorrelationDays', () => {
  it('devolve a janela de 30 dias terminando em hoje (BRT)', () => {
    const { days } = buildCorrelationDays([], [], AGORA)
    expect(days).toHaveLength(CORRELATION_WINDOW_DAYS)
    expect(days[days.length - 1].date).toBe('2026-08-10')
    expect(days[0].date).toBe('2026-07-12')
  })

  /**
   * O caso que separa "dia BRT" de "dia UTC": 22h30 em São Paulo no dia 10 já é
   * 01h30 UTC do dia 11. O treino é de segunda para quem treinou, e o bucketing
   * antigo o colocava na terça.
   */
  it('treino das 22h30 BRT conta no dia em que o usuário treinou', () => {
    const { days } = buildCorrelationDays(['2026-08-11T01:30:00.000Z'], [], AGORA)
    const seg = days.find((d) => d.date === '2026-08-10')
    const ter = days.find((d) => d.date === '2026-08-11')
    expect(seg?.had_workout).toBe(true)
    expect(ter).toBeUndefined() // 11 ainda não existe: hoje é 10 em BRT
  })

  it('o último dia da grade é hoje em BRT mesmo depois da virada do UTC', () => {
    // 10/08 22h30 BRT = 11/08 01h30 UTC. Hoje continua sendo 10.
    const { days } = buildCorrelationDays([], [], Date.parse('2026-08-11T01:30:00.000Z'))
    expect(days[days.length - 1].date).toBe('2026-08-10')
  })

  it('o dia da semana não depende do fuso do servidor', () => {
    const { days } = buildCorrelationDays([], [], AGORA)
    // 10/08/2026 é uma segunda-feira.
    expect(days[days.length - 1].weekday).toBe(1)
    expect(days[0].weekday).toBe(0) // 12/07/2026, domingo
  })

  it('nutrição vem de dia-calendário e não é reinterpretada como instante', () => {
    const { days, stats } = buildCorrelationDays([], [{ date: '2026-08-09', calories: 2100 }], AGORA)
    const dia = days.find((d) => d.date === '2026-08-09')
    expect(dia?.had_nutrition).toBe(true)
    expect(dia?.nutrition_calories).toBe(2100)
    expect(stats.nutritionDays).toBe(1)
  })

  it('conta treino, dieta e a interseção — sincronia sobre os dias TREINADOS', () => {
    const { stats } = buildCorrelationDays(
      ['2026-08-10T14:00:00.000Z', '2026-08-09T14:00:00.000Z', '2026-08-08T14:00:00.000Z'],
      [{ date: '2026-08-10', calories: 2000 }, { date: '2026-08-07', calories: 1800 }],
      AGORA,
    )
    expect(stats.workoutDays).toBe(3)
    expect(stats.nutritionDays).toBe(2)
    expect(stats.bothDays).toBe(1)
    expect(stats.workoutWithoutNutrition).toBe(2)
    expect(stats.correlationPct).toBe(33) // 1 de 3 treinos com dieta
  })

  it('sem treino nenhum, a sincronia é 0 e não NaN', () => {
    const { stats } = buildCorrelationDays([], [{ date: '2026-08-10', calories: 2000 }], AGORA)
    expect(stats.correlationPct).toBe(0)
  })

  it('duas sessões no mesmo dia contam como um dia treinado', () => {
    const { stats } = buildCorrelationDays(
      ['2026-08-10T11:00:00.000Z', '2026-08-10T22:00:00.000Z'],
      [],
      AGORA,
    )
    expect(stats.workoutDays).toBe(1)
  })

  it('timestamp inválido não vira dia fantasma', () => {
    const { stats } = buildCorrelationDays(['', 'não é data'], [], AGORA)
    expect(stats.workoutDays).toBe(0)
  })
})

describe('a rota não volta a bucketar por UTC', () => {
  it('delega o dia à função pura e não fatia ISO por conta própria', async () => {
    const { readFileSync } = await import('node:fs')
    const rota = readFileSync('src/app/api/nutrition/correlation/route.ts', 'utf8')
    const executavel = rota
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(executavel).toContain('buildCorrelationDays')
    expect(executavel, 'fatiar o ISO devolve o dia UTC — o bug original')
      .not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/)
  })

  /**
   * `workout_calories` era o literal 300 por sessão, exibido como se fosse
   * medição. A tabela não guarda gasto; a estimativa real exige `workouts.notes`,
   * que não pode entrar em rota quente.
   */
  it('não inventa kcal de treino', async () => {
    const { readFileSync } = await import('node:fs')
    const rota = readFileSync('src/app/api/nutrition/correlation/route.ts', 'utf8')
    const executavel = rota
      .replace(/\/\*[^]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(executavel).not.toContain('workout_calories')
    expect(executavel, 'notes carrega a sessão inteira — nunca em rota quente')
      .not.toMatch(/select\([^)]*notes/)
  })
})

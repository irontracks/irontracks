import { describe, it, expect } from 'vitest'
import {
  deriveTrainingSchedule,
  trainingScheduleToPrompt,
  spHoursOf,
  spDayKey,
  formatHours,
  periodOf,
  MIN_SESSIONS,
} from '../trainingSchedule'
import { findTrainingWindowIssues, parseMealTime } from '../mealCoherence'

/**
 * Dados REAIS da conta do dono (`workouts.completed_at`, agosto/2026). Todos os
 * treinos terminam entre 07:34 e 08:29; o cardápio gerado marcava "Pós-Treino
 * 18:30". Os instantes abaixo estão em UTC, como vêm do banco — 10:59Z é 07:59 em
 * São Paulo, e é justamente esse -3 que faria o guard errar se alguém comparasse a
 * hora crua.
 */
const TREINOS_REAIS = [
  '2026-08-03T10:59:00Z',
  '2026-07-31T10:36:00Z',
  '2026-07-30T10:39:00Z',
  '2026-07-29T11:07:00Z',
  '2026-07-28T10:34:00Z',
  '2026-07-27T10:59:00Z',
  '2026-07-24T11:02:00Z',
  '2026-07-23T10:45:00Z',
]

/** Refeições reais: ele lança o "Pós treino" às 09:04, e nada antes de treinar. */
const REFEICOES_REAIS = [
  '2026-08-03T12:04:00Z', // 09:04 SP
  '2026-07-31T13:04:00Z', // 10:04
  '2026-07-30T12:19:00Z', // 09:19
  '2026-07-29T13:46:00Z', // 10:46
  '2026-07-24T08:21:00Z', // 05:21 — o ÚNICO dia em que comeu antes de treinar
]

describe('fuso — o servidor roda em UTC e o usuário treina em São Paulo', () => {
  it('10:59Z é 07:59 em São Paulo', () => {
    expect(spHoursOf('2026-08-03T10:59:00Z')).toBeCloseTo(7 + 59 / 60, 3)
  })

  it('o dia-calendário também é o de São Paulo', () => {
    // 02:30Z do dia 4 ainda é dia 3 em SP — é o que casa refeição com treino.
    expect(spDayKey('2026-08-04T02:30:00Z')).toBe('2026-08-03')
  })

  it('data inválida não vira NaN silencioso', () => {
    expect(spHoursOf('não é data')).toBeNull()
    expect(spDayKey(undefined)).toBe('')
  })

  it.each([[7.83, '07:50'], [18.5, '18:30'], [6, '06:00']])('%s → %s', (h, s) =>
    expect(formatHours(h as number)).toBe(s),
  )

  it.each([[6, 'manhã'], [14, 'tarde'], [20, 'noite'], [3, 'madrugada']] as const)(
    '%sh é %s',
    (h, p) => expect(periodOf(h)).toBe(p),
  )
})

describe('a rotina sai do histórico', () => {
  const schedule = deriveTrainingSchedule(TREINOS_REAIS, REFEICOES_REAIS)

  it('acha o fim do treino de manhã, não à tarde', () => {
    expect(schedule).not.toBeNull()
    expect(schedule!.period).toBe('manhã')
    expect(formatHours(schedule!.endHour)).toBe('07:52')
  })

  it('estima o início uma hora antes', () => {
    expect(formatHours(schedule!.startHour)).toBe('06:52')
  })

  it('detecta o jejum sem ninguém declarar', () => {
    expect(schedule!.fasted).toBe(true)
  })

  it('UM dia com café antes não desfaz o jejum dos outros onze', () => {
    // A armadilha: comparar as horas de refeição de TODOS os dias contra CADA
    // treino faz o café das 05:21 de 24/07 valer para as 8 sessões, e o usuário
    // que treina em jejum passa a receber pré-treino. O casamento é por DIA.
    expect(schedule!.sampleSize).toBe(8)
    expect(schedule!.fasted).toBe(true)
  })

  it('quem come antes todo dia NÃO é marcado como jejum', () => {
    const comendo = TREINOS_REAIS.map((t) => t.replace(/T(\d\d)/, (_, h) => `T${String(Number(h) - 2).padStart(2, '0')}`))
    // Cada treino ganha uma refeição 2 h antes, no mesmo dia.
    const s = deriveTrainingSchedule(TREINOS_REAIS, comendo)
    expect(s!.fasted).toBe(false)
  })

  it(`abaixo de ${MIN_SESSIONS} sessões não inventa horário`, () => {
    expect(deriveTrainingSchedule(TREINOS_REAIS.slice(0, MIN_SESSIONS - 1), [])).toBeNull()
    expect(deriveTrainingSchedule([], [])).toBeNull()
  })
})

describe('o que o modelo recebe', () => {
  const prompt = trainingScheduleToPrompt(deriveTrainingSchedule(TREINOS_REAIS, REFEICOES_REAIS))

  it('diz o horário medido e proíbe o pós-treino à noite', () => {
    expect(prompt).toContain('07:52')
    expect(prompt).toContain('NUNCA à tarde ou à noite')
  })

  it('manda NÃO criar pré-treino para quem treina em jejum', () => {
    expect(prompt).toContain('EM JEJUM')
    expect(prompt).toMatch(/NÃO crie refeição "Pré-Treino"/)
  })

  it('para quem come antes, pede o pré-treino na janela certa', () => {
    const comendo = deriveTrainingSchedule(TREINOS_REAIS, TREINOS_REAIS.map((t) => t.replace('T10', 'T09').replace('T11', 'T10')))
    const p = trainingScheduleToPrompt(comendo)
    expect(p).toContain('Pré-Treino')
    expect(p).not.toContain('EM JEJUM')
  })

  it('sem rotina conhecida, não afirma horário nenhum', () => {
    expect(trainingScheduleToPrompt(null)).toBe('')
  })
})

describe('o cardápio é reprovado quando ignora o horário de treino', () => {
  const schedule = { startHour: 6.87, endHour: 7.87, fasted: true }

  it('"Pós-Treino 18:30" para quem treina de manhã é o caso reportado', () => {
    const issues = findTrainingWindowIssues([{ name: 'Pós-Treino', time: '18:30', items: [] }], schedule)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.kind).toBe('training_window')
    expect(issues[0]!.message).toContain('07:52')
  })

  it('"Pós-Treino 08:30" passa', () => {
    expect(findTrainingWindowIssues([{ name: 'Pós-Treino', time: '08:30', items: [] }], schedule)).toEqual([])
  })

  it('pré-treino para quem treina em jejum é reprovado', () => {
    const issues = findTrainingWindowIssues([{ name: 'Pré-Treino', time: '06:00', items: [] }], schedule)
    expect(issues[0]!.message).toContain('treina em jejum')
  })

  it('quem NÃO treina em jejum pode ter pré-treino na hora certa', () => {
    const comendo = { ...schedule, fasted: false }
    expect(findTrainingWindowIssues([{ name: 'Pré-Treino', time: '06:00', items: [] }], comendo)).toEqual([])
    // …e não às 15:00.
    expect(findTrainingWindowIssues([{ name: 'Pré-Treino', time: '15:00', items: [] }], comendo)).toHaveLength(1)
  })

  it('refeição comum não é afetada pela regra', () => {
    const meals = [
      { name: 'Café da Manhã', time: '08:30', items: [] },
      { name: 'Almoço', time: '12:00', items: [] },
      { name: 'Jantar', time: '21:00', items: [] },
    ]
    expect(findTrainingWindowIssues(meals, schedule)).toEqual([])
  })

  it('sem rotina conhecida, nada é reprovado', () => {
    expect(findTrainingWindowIssues([{ name: 'Pós-Treino', time: '18:30', items: [] }], null)).toEqual([])
  })

  it('horário ilegível não vira reprovação (nem NaN)', () => {
    expect(findTrainingWindowIssues([{ name: 'Pós-Treino', time: '', items: [] }], schedule)).toEqual([])
    expect(parseMealTime('99:99')).toBeNull()
    expect(parseMealTime('7h30')).toBeCloseTo(7.5, 3)
  })
})

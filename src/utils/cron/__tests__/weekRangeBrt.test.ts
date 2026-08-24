/**
 * A semana do app é **domingo→sábado**, no calendário de São Paulo.
 *
 * Duas decisões distintas travadas aqui:
 *
 * 1. **Domingo abre a semana** — decisão do dono em 24/08/2026. A Fran treinou
 *    domingo a sexta (6 treinos) e o resumo disse 5, porque o app fechava
 *    segunda→domingo e o domingo dela caía na semana anterior. A agenda do app
 *    já começava no domingo; o resto é que estava fora de linha.
 * 2. **Fuso BRT** — com fronteira UTC a semana viraria às 21h de sábado, e
 *    treino de sábado à noite cairia na semana seguinte. Mesma classe do streak
 *    (36 de 633 sessões em dia divergente) e do heatmap de nutrição.
 */
import { describe, it, expect } from 'vitest'
import {
  previousWeekRangeBrt,
  currentWeekRangeBrt,
  weekStartDayBrt,
  weekRangeOfDayBrt,
  brtDayStartUtc,
} from '../weekRangeBrt'

describe('brtDayStartUtc', () => {
  it('meia-noite BRT é 03:00 UTC do mesmo dia', () => {
    expect(brtDayStartUtc('2026-08-23').toISOString()).toBe('2026-08-23T03:00:00.000Z')
  })
})

describe('weekStartDayBrt — o domingo que abre a semana', () => {
  it('varre os sete dias: 23/08 a 29/08 pertencem todos ao domingo 23', () => {
    // Teste que depende de "hoje" varre a semana inteira — senão passa por sorte
    // no único dia em que a conta erra (lição de ago/2026, `myDietPlan`).
    for (let dia = 23; dia <= 29; dia += 1) {
      expect(weekStartDayBrt(new Date(`2026-08-${dia}T15:00:00Z`)), `dia ${dia}`).toBe('2026-08-23')
    }
  })

  it('no próprio domingo, a semana começa NELE — não na segunda seguinte', () => {
    expect(weekStartDayBrt(new Date('2026-08-23T15:00:00Z'))).toBe('2026-08-23')
  })

  it('sábado 23h BRT ainda é da semana que fecha, não da seguinte', () => {
    // Sáb 29/08 23:00 BRT = dom 30/08 02:00 UTC. Pela fronteira UTC seria a
    // semana nova, e o treino sumiria do resumo de sábado.
    expect(weekStartDayBrt(new Date('2026-08-30T02:00:00Z'))).toBe('2026-08-23')
  })

  it('domingo 00:30 BRT já abre a semana nova', () => {
    expect(weekStartDayBrt(new Date('2026-08-30T03:30:00Z'))).toBe('2026-08-30')
  })
})

describe('currentWeekRangeBrt / previousWeekRangeBrt', () => {
  // Segunda 24/08 às 08:00 BRT (11:00 UTC) — o horário em que o cron roda.
  const segunda0800Brt = new Date('2026-08-24T11:00:00Z')

  it('a semana corrente vai de domingo a sábado', () => {
    const r = currentWeekRangeBrt(segunda0800Brt)
    expect(r.startDay).toBe('2026-08-23')
    expect(r.endDay).toBe('2026-08-29')
    expect(r.startIso).toBe('2026-08-23T03:00:00.000Z')
    expect(r.endIso).toBe('2026-08-30T03:00:00.000Z')
  })

  it('a semana anterior é 16–22, e é ela que traz o domingo da Fran', () => {
    const r = previousWeekRangeBrt(segunda0800Brt)
    expect(r.startDay).toBe('2026-08-16')
    expect(r.endDay).toBe('2026-08-22')

    // O treino dela: domingo 16/08 às 10:13 BRT = 13:13 UTC.
    const domingoDaFran = new Date('2026-08-16T13:13:03Z')
    expect(domingoDaFran >= new Date(r.startIso)).toBe(true)
    expect(domingoDaFran < new Date(r.endIso)).toBe(true)
  })

  it('os 6 treinos da Fran caem na MESMA semana — era esse o ponto', () => {
    const r = previousWeekRangeBrt(segunda0800Brt)
    const dela = [
      '2026-08-16T13:13:03Z', // dom
      '2026-08-17T11:05:45Z', // seg
      '2026-08-18T10:37:32Z', // ter
      '2026-08-19T10:55:32Z', // qua
      '2026-08-20T10:26:11Z', // qui
      '2026-08-21T10:21:54Z', // sex
    ].map((x) => new Date(x))
    const dentro = dela.filter((d) => d >= new Date(r.startIso) && d < new Date(r.endIso))
    expect(dentro).toHaveLength(6)
  })

  it('sábado 23h BRT pertence à semana que fecha', () => {
    const r = previousWeekRangeBrt(segunda0800Brt)
    const sabadoNoite = new Date('2026-08-23T02:00:00Z') // sáb 22/08 23:00 BRT
    expect(sabadoNoite < new Date(r.endIso)).toBe(true)
  })

  it('rodando no sábado à noite, a semana anterior ainda é a de antes', () => {
    // Sáb 29/08 23:00 BRT = dom 30/08 02:00 UTC: em UTC já virou, em BRT não.
    const r = previousWeekRangeBrt(new Date('2026-08-30T02:00:00Z'))
    expect(r.startDay).toBe('2026-08-16')
  })
})

describe('weekRangeOfDayBrt', () => {
  it('resolve a semana de um dia qualquer', () => {
    expect(weekRangeOfDayBrt('2026-08-19').startDay).toBe('2026-08-16')
    expect(weekRangeOfDayBrt('2026-08-23').startDay).toBe('2026-08-23')
    expect(weekRangeOfDayBrt('2026-08-22').endDay).toBe('2026-08-22')
  })
})

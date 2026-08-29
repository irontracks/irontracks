import { describe, it, expect } from 'vitest'
import {
  shouldNotifyStreakAtRisk,
  weekKeysFor,
  weekdayIndexSundayFirst,
  addDaysToKey,
  inferWeeklyTarget,
} from '../streakRisk'

// Semana de referência do app: DOMINGO → sábado (mudança de 24/08/2026).
// 2026-07-19 é domingo; 2026-07-25, sábado.
const SUN = '2026-07-19'
const MON = '2026-07-20'
const TUE = '2026-07-21'
const WED = '2026-07-22'
const THU = '2026-07-23'
const FRI = '2026-07-24'
const SAT = '2026-07-25'

const set = (...keys: string[]) => new Set(keys)

describe('helpers de data', () => {
  it('addDaysToKey atravessa virada de mês', () => {
    expect(addDaysToKey('2026-07-01', -1)).toBe('2026-06-30')
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('weekdayIndexSundayFirst usa DOMINGO como 0 — a semana do app', () => {
    expect(weekdayIndexSundayFirst(SUN)).toBe(0)
    expect(weekdayIndexSundayFirst(MON)).toBe(1)
    expect(weekdayIndexSundayFirst(SAT)).toBe(6)
  })

  it('weekKeysFor devolve domingo→sábado da semana do dia', () => {
    expect(weekKeysFor(THU)).toEqual([SUN, MON, TUE, WED, THU, FRI, SAT])
    expect(weekKeysFor(SUN)).toEqual([SUN, MON, TUE, WED, THU, FRI, SAT])
    expect(weekKeysFor(SAT)).toEqual([SUN, MON, TUE, WED, THU, FRI, SAT])
  })
})

describe('shouldNotifyStreakAtRisk — meta semanal declarada', () => {
  // ESTE É O BUG REPORTADO PELO DONO (jul/2026): treinou seg/ter/qua com
  // meta de 5, folga na quinta → o cron antigo disparava porque só olhava
  // "3 dias consecutivos + não treinou hoje".
  it('NÃO alerta em dia de descanso quando a meta ainda é alcançável', () => {
    expect(
      shouldNotifyStreakAtRisk({
        trainedDates: set(MON, TUE, WED),
        todayKey: THU,
        weeklyTarget: 5,
      }),
    ).toBe(false)
  })

  it('NÃO alerta quando a meta da semana já foi batida', () => {
    expect(
      shouldNotifyStreakAtRisk({
        trainedDates: set(MON, TUE, WED, THU, FRI),
        todayKey: SAT,
        weeklyTarget: 5,
      }),
    ).toBe(false)
  })

  it('alerta quando hoje é indispensável para bater a meta', () => {
    // Semana domingo→sábado: o SÁBADO é o último dia (resta 1). Meta 5 com 4
    // treinos feitos → falta 1 e resta 1: hoje é indispensável.
    expect(
      shouldNotifyStreakAtRisk({
        trainedDates: set(SUN, MON, TUE, WED),
        todayKey: SAT,
        weeklyTarget: 5,
      }),
    ).toBe(true)
  })

  it('na SEXTA ainda dá para folgar — restam 2 dias para 1 treino que falta', () => {
    // O caso irmão do de cima: mesma meta, um dia antes. É ele que prova que a
    // fronteira da semana moveu junto com a regra domingo→sábado.
    expect(
      shouldNotifyStreakAtRisk({
        trainedDates: set(SUN, MON, TUE, WED),
        todayKey: FRI,
        weeklyTarget: 5,
      }),
    ).toBe(false)
  })

  it('NÃO alerta quando a semana já está aritmeticamente perdida', () => {
    // Meta 5, só treinou segunda, hoje é sábado: faltam 4, restam 2 dias.
    expect(
      shouldNotifyStreakAtRisk({
        trainedDates: set(MON),
        todayKey: SAT,
        weeklyTarget: 5,
      }),
    ).toBe(false)
  })

  it('meta 7 alerta em qualquer dia sem treino, como esperado', () => {
    // Domingo→sábado: na QUARTA (índice 3) restam 4 dias. Com 3 treinos feitos
    // e meta 7, faltam 4 — todo dia daqui em diante é indispensável.
    expect(
      shouldNotifyStreakAtRisk({
        trainedDates: set(SUN, MON, TUE),
        todayKey: WED,
        weeklyTarget: 7,
      }),
    ).toBe(true)
  })

  it('nunca alerta se já treinou hoje', () => {
    expect(
      shouldNotifyStreakAtRisk({ trainedDates: set(MON, TUE, WED, THU), todayKey: THU, weeklyTarget: 7 }),
    ).toBe(false)
  })
})

describe('inferWeeklyTarget — cadência real de quem não declarou a meta', () => {
  /** Gera N dias de treino por semana nas 4 semanas antes de 2026-07-20. */
  const history = (perWeek: number) => {
    const keys: string[] = []
    for (let w = 1; w <= 4; w += 1) {
      for (let d = 0; d < perWeek; d += 1) {
        keys.push(addDaysToKey(MON, -(w * 7) + d))
      }
    }
    return new Set(keys)
  }

  it('infere 5x/semana de quem treinou 5 dias por semana', () => {
    expect(inferWeeklyTarget(history(5), THU)).toBe(5)
  })

  it('não infere quando o histórico é raso', () => {
    expect(inferWeeklyTarget(set(MON, TUE), THU)).toBeNull()
  })

  // O caso do dono (jul/2026): frequência NÃO declarada no perfil, mas o
  // histórico mostra 5x/semana. O alerta não pode sair no dia de descanso.
  it('protege o dia de descanso de quem treina 5x sem meta declarada', () => {
    const trainedDates = new Set([...history(5), MON, TUE, WED])
    expect(shouldNotifyStreakAtRisk({ trainedDates, todayKey: THU, weeklyTarget: null })).toBe(false)
  })
})

describe('shouldNotifyStreakAtRisk — sem meta nem histórico (fallback original)', () => {
  it('alerta com 3 dias consecutivos', () => {
    expect(
      shouldNotifyStreakAtRisk({ trainedDates: set(MON, TUE, WED), todayKey: THU, weeklyTarget: null }),
    ).toBe(true)
  })

  it('não alerta com menos de 3 dias consecutivos', () => {
    expect(
      shouldNotifyStreakAtRisk({ trainedDates: set(TUE, WED), todayKey: THU, weeklyTarget: null }),
    ).toBe(false)
  })

  it('trata 0 como meta não declarada', () => {
    expect(
      shouldNotifyStreakAtRisk({ trainedDates: set(MON, TUE, WED), todayKey: THU, weeklyTarget: 0 }),
    ).toBe(true)
  })
})

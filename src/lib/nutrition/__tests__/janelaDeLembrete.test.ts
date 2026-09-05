/**
 * Guards da janela do lembrete de refeição.
 *
 * Duas coisas que este repo já pagou caro e que estão as duas aqui:
 *  - **fuso**: a Vercel roda em UTC e o usuário come em São Paulo. Ler a hora do
 *    servidor joga o jantar das 21h no dia seguinte (streak, heatmap e cota VIP
 *    caíram nisso);
 *  - **virada do dia**: a janela de 6 minutos cruza a meia-noite, e os minutos de
 *    lá são de OUTRO dia da semana — a ceia de sábado não pode ser cobrada do
 *    cardápio de domingo.
 */
import { describe, it, expect } from 'vitest'
import { instanteBrt, janelaDeLembretes, LARGURA_JANELA_MIN } from '../janelaDeLembrete'

describe('instanteBrt — a hora é de São Paulo, não do servidor', () => {
  it('22:30 BRT é 22:30, e não 01:30 do dia seguinte', () => {
    // 2026-09-05T01:30Z = sexta 22:30 em São Paulo (04/09, quinta? não: 04/09 é
    // sexta-feira). Em UTC já é sábado 05 — é essa a diferença que importa.
    const i = instanteBrt(new Date('2026-09-05T01:30:00Z'))
    expect(i.dateKey).toBe('2026-09-04')
    expect(i.minuto).toBe(22 * 60 + 30)
    expect(i.weekday).toBe(5) // sexta
  })

  it('meia-noite BRT é o minuto 0 do dia novo', () => {
    const i = instanteBrt(new Date('2026-09-05T03:00:00Z'))
    expect(i.dateKey).toBe('2026-09-05')
    expect(i.minuto).toBe(0)
    expect(i.weekday).toBe(6) // sábado
  })
})

describe('janelaDeLembretes', () => {
  it('cobre os minutos que acabaram de passar, do mais antigo ao agora', () => {
    const j = janelaDeLembretes(new Date('2026-09-05T15:02:00Z')) // 12:02 BRT
    expect(j).toHaveLength(LARGURA_JANELA_MIN)
    expect(j.map((i) => i.minuto)).toEqual([717, 718, 719, 720, 721, 722]) // 11:57 … 12:02
    // 12:00 precisa estar na janela — é o horário que as pessoas escolhem.
    expect(j.some((i) => i.minuto === 12 * 60)).toBe(true)
  })

  it('todos os minutos são do mesmo dia quando a janela não vira', () => {
    const j = janelaDeLembretes(new Date('2026-09-05T15:02:00Z'))
    expect(new Set(j.map((i) => i.dateKey))).toEqual(new Set(['2026-09-05']))
    expect(new Set(j.map((i) => i.weekday))).toEqual(new Set([6]))
  })

  it('⚠️ cruzando a meia-noite, os minutos de ontem levam o dia de ONTEM', () => {
    // 00:02 BRT de domingo 06/09: os minutos 23:57–23:59 são do sábado 05.
    const j = janelaDeLembretes(new Date('2026-09-06T03:02:00Z'))
    const ontem = j.filter((i) => i.minuto >= 1437)
    const hoje = j.filter((i) => i.minuto <= 2)
    expect(ontem).toHaveLength(3)
    expect(hoje).toHaveLength(3)
    for (const i of ontem) {
      expect(i.dateKey).toBe('2026-09-05')
      expect(i.weekday).toBe(6) // sábado
    }
    for (const i of hoje) {
      expect(i.dateKey).toBe('2026-09-06')
      expect(i.weekday).toBe(0) // domingo
    }
  })

  it('a janela sobrepõe o cron de 5 min — execução atrasada não abre buraco', () => {
    expect(LARGURA_JANELA_MIN).toBeGreaterThan(5)
  })

  it('largura absurda não quebra a lista', () => {
    expect(janelaDeLembretes(new Date('2026-09-05T15:02:00Z'), 0)).toHaveLength(1)
    expect(janelaDeLembretes(new Date('2026-09-05T15:02:00Z'), 99999)).toHaveLength(24 * 60)
  })
})

/**
 * A semana dos crons é o calendário de **São Paulo**, não o de UTC.
 *
 * Com fronteira UTC a semana começava **domingo 21:00 BRT** — todo treino de
 * domingo à noite caía na semana seguinte, e o resumo de segunda mostrava um
 * treino a menos. Mesma classe já corrigida no streak (36 de 633 sessões em
 * dia divergente) e no heatmap de nutrição.
 *
 * A semana continua segunda→domingo. Isso NÃO é o caso da Fran: o "domingo"
 * dela foi 16/08, o domingo anterior, contado na semana 10–16.
 */
import { describe, it, expect } from 'vitest'
import { previousWeekRangeBrt, brtDayStartUtc } from '../weekRangeBrt'

describe('brtDayStartUtc', () => {
  it('meia-noite BRT é 03:00 UTC do mesmo dia', () => {
    expect(brtDayStartUtc('2026-08-17').toISOString()).toBe('2026-08-17T03:00:00.000Z')
  })
})

describe('previousWeekRangeBrt', () => {
  // Segunda 24/08 às 08:00 BRT (11:00 UTC) — o horário exato em que o cron roda.
  const segunda0800Brt = new Date('2026-08-24T11:00:00Z')

  it('na segunda de manhã devolve a semana 17–23', () => {
    const r = previousWeekRangeBrt(segunda0800Brt)
    expect(r.startDay).toBe('2026-08-17')
    expect(r.endDay).toBe('2026-08-23')
  })

  it('o intervalo abre e fecha na meia-noite BRT, não na de UTC', () => {
    const r = previousWeekRangeBrt(segunda0800Brt)
    expect(r.startIso).toBe('2026-08-17T03:00:00.000Z')
    // Fim EXCLUSIVO: 00:00 BRT da segunda seguinte.
    expect(r.endIso).toBe('2026-08-24T03:00:00.000Z')
  })

  it('domingo 22h BRT pertence à semana que acaba — era o treino perdido', () => {
    const r = previousWeekRangeBrt(segunda0800Brt)
    // Domingo 23/08 às 22:00 BRT = 24/08 01:00 UTC. Pela fronteira UTC antiga
    // (`< '2026-08-24'`) este treino ficava DE FORA da semana.
    const domingoTarde = new Date('2026-08-24T01:00:00Z')
    expect(domingoTarde >= new Date(r.startIso)).toBe(true)
    expect(domingoTarde < new Date(r.endIso)).toBe(true)
  })

  it('segunda 00:30 BRT já é da semana nova, não da que fechou', () => {
    const r = previousWeekRangeBrt(segunda0800Brt)
    const segundaMadrugada = new Date('2026-08-24T03:30:00Z') // 00:30 BRT
    expect(segundaMadrugada < new Date(r.endIso)).toBe(false)
  })

  it('a virada do dia UTC não muda a resposta — o cron roda de manhã, mas o guard varre', () => {
    // Domingo 23/08 às 23:00 BRT = segunda 02:00 UTC. Em UTC já é segunda, e a
    // conta ingênua ("hoje é segunda") pularia uma semana inteira.
    const domingoNoiteBrt = new Date('2026-08-24T02:00:00Z')
    const r = previousWeekRangeBrt(domingoNoiteBrt)
    // Ainda é DOMINGO em São Paulo → a semana anterior é 10–16.
    expect(r.startDay).toBe('2026-08-10')
    expect(r.endDay).toBe('2026-08-16')
  })

  it('cobre os sete dias da semana sem pular nem repetir', () => {
    // Teste que depende de "hoje" varre a semana inteira (regra do repo).
    for (let dia = 17; dia <= 23; dia += 1) {
      const dentroDaSemana = new Date(`2026-08-${dia}T15:00:00Z`)
      const r = previousWeekRangeBrt(dentroDaSemana)
      expect(r.startDay, `dia ${dia}`).toBe('2026-08-10')
      expect(r.endDay, `dia ${dia}`).toBe('2026-08-16')
    }
  })
})

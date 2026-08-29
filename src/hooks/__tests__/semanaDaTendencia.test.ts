import { describe, it, expect } from 'vitest'
import { getWeekStartIso } from '../useMuscleTrends'

/**
 * A semana da TENDÊNCIA do relatório (barras de 4–5 semanas).
 *
 * Calculava `(weekdayIndex + 6) % 7` — a segunda. Na maioria dos dias isso
 * passava porque a rota (`muscle-map-week`) normaliza a data recebida com
 * `weekStartDayBrt`. Mas para uma sessão de DOMINGO o cálculo apontava para a
 * segunda ANTERIOR, e a rota então devolvia a semana inteira anterior: a
 * tendência do treino de domingo mostrava a semana errada — justamente o dia
 * que a mudança de 24/08/2026 moveu.
 *
 * ⚠️ Teste de COMPORTAMENTO porque o guard `semanaComecaNoDomingo` lê só a
 * forma do código. Provado por mutação: trocar a função por "data − 1 dia"
 * deixava aquele guard verde.
 */
describe('getWeekStartIso', () => {
  it('o DOMINGO abre a própria semana — não aponta para a segunda anterior', () => {
    // 23/08/2026 é domingo.
    expect(getWeekStartIso(new Date('2026-08-23T15:00:00Z'))).toBe('2026-08-23')
  })

  it('todo dia da semana aponta para o mesmo domingo', () => {
    const esperado = '2026-08-23'
    for (const dia of ['23', '24', '25', '26', '27', '28', '29']) {
      expect(getWeekStartIso(new Date(`2026-08-${dia}T15:00:00Z`)), `dia ${dia}`).toBe(esperado)
    }
  })

  it('o sábado seguinte já é outra semana', () => {
    expect(getWeekStartIso(new Date('2026-08-30T15:00:00Z'))).toBe('2026-08-30')
  })

  it('a fronteira é BRT: 21h de sábado ainda pertence à semana do sábado', () => {
    // 2026-08-30T00:30:00Z = 29/08 21:30 em São Paulo.
    expect(getWeekStartIso(new Date('2026-08-30T00:30:00Z'))).toBe('2026-08-23')
  })
})

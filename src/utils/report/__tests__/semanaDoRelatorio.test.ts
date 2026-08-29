import { describe, it, expect } from 'vitest'
import { buildWeeklyVolumeStats } from '../reportMetrics'

/**
 * A semana do relatório é a mesma do resto do app: DOMINGO → sábado, BRT.
 *
 * Até 28/08/2026 este arquivo calculava `(weekdayIndex + 6) % 7` — a SEGUNDA —,
 * enquanto o app mudou para domingo→sábado em 24/08. O treino de domingo caía
 * na semana anterior aqui e na semana atual no resumo semanal, no push e no
 * mapa muscular: o mesmo treino em duas semanas diferentes conforme a tela.
 *
 * ⚠️ O guard `semanaComecaNoDomingo` NÃO cobre isto: ele lê a FORMA do código
 * (regex sobre as maneiras de calcular à mão). Provado por mutação — trocar a
 * função por `data − 1 dia` deixava aquele guard verde. Guard de forma não
 * substitui teste de comportamento, e é por isso que este arquivo existe.
 */

/** Uma sessão com uma série concluída de 100 kg × 10 = 1000 kg de volume. */
const sessao = (iso: string) => ({
    date: iso,
    logs: { '0-0': { done: true, weight: '100', reps: '10' } },
})

describe('buildWeeklyVolumeStats — fronteira da semana', () => {
    it('DOMINGO abre a semana: o treino de domingo é da semana dele, não da anterior', () => {
        // 23/08/2026 é domingo. Com a semana começando na segunda, ele cairia
        // na semana de 17–23 e o volume iria para `previousWeekKg`.
        const domingo = sessao('2026-08-23T15:00:00Z')
        const sabadoAnterior = sessao('2026-08-22T15:00:00Z')
        const r = buildWeeklyVolumeStats(domingo, [sabadoAnterior])

        expect(r.currentWeekKg, 'o domingo tem que abrir a semana').toBe(1000)
        expect(r.previousWeekKg, 'o sábado anterior é da semana passada').toBe(1000)
    })

    it('sábado FECHA a semana — ele e o domingo anterior estão juntos', () => {
        const sabado = sessao('2026-08-29T15:00:00Z')
        const domingoDaMesmaSemana = sessao('2026-08-23T15:00:00Z')
        const r = buildWeeklyVolumeStats(sabado, [domingoDaMesmaSemana])

        expect(r.currentWeekKg).toBe(2000)
        expect(r.previousWeekKg).toBe(0)
    })

    it('a segunda-feira NÃO abre semana nova', () => {
        // Se a fronteira voltasse para a segunda, estes dois ficariam separados.
        const segunda = sessao('2026-08-24T15:00:00Z')
        const domingoAnterior = sessao('2026-08-23T15:00:00Z')
        const r = buildWeeklyVolumeStats(segunda, [domingoAnterior])

        expect(r.currentWeekKg).toBe(2000)
    })

    it('a fronteira é BRT: 21h de sábado ainda é sábado, mesmo sendo domingo em UTC', () => {
        // 2026-08-30T00:30:00Z = 29/08 21:30 em São Paulo (sábado).
        const sabadoTarde = sessao('2026-08-30T00:30:00Z')
        const quintaDaMesmaSemana = sessao('2026-08-27T15:00:00Z')
        const r = buildWeeklyVolumeStats(sabadoTarde, [quintaDaMesmaSemana])

        expect(r.currentWeekKg, 'o dia UTC jogaria este treino para a semana seguinte').toBe(2000)
    })

    it('sem semana anterior, a variação não inventa queda', () => {
        const r = buildWeeklyVolumeStats(sessao('2026-08-26T15:00:00Z'), [])
        expect(r.previousWeekKg).toBe(0)
        expect(r.deltaPct).toBe(0)
        expect(r.isHeavyWeek).toBe(false)
    })
})

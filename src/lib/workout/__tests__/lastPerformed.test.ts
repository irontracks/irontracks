import { describe, it, expect } from 'vitest'
import { buildLastPerformedMap, formatarUltimaVez } from '../lastPerformed'
import { resolveWorkoutKey } from '../workoutKey'

/**
 * "Há quanto tempo eu não faço este treino?"
 *
 * O card mostrava exercícios, minutos e séries — nada sobre QUANDO. Com cinco
 * treinos, nada dizia qual estava atrasado, e o dado estava a uma tela de
 * distância.
 */

const chave = (nome: string) => resolveWorkoutKey({ name: nome })

describe('buildLastPerformedMap', () => {
    it('guarda a execução MAIS RECENTE — e a consulta chega em ordem DECRESCENTE', () => {
        // A ordem importa: a consulta real ordena `completed_at` desc, então a
        // mais recente vem PRIMEIRO. Um "último que chega vence" passaria com a
        // lista crescente e perderia a data certa em produção.
        const m = buildLastPerformedMap([
            { name: 'SEG · Upper B', completed_at: '2026-08-24T10:00:00Z' },
            { name: 'SEG · Upper B', completed_at: '2026-08-10T10:00:00Z' },
            { name: 'TER · Lower A', completed_at: '2026-08-20T10:00:00Z' },
        ])
        expect(m.get(chave('SEG · Upper B'))).toBe(new Date('2026-08-24T10:00:00Z').getTime())
        expect(m.get(chave('TER · Lower A'))).toBe(new Date('2026-08-20T10:00:00Z').getTime())
    })

    it('usa a MESMA chave do resto do app — outra normalização apontaria para outro treino', () => {
        const m = buildLastPerformedMap([{ name: '  seg · UPPER b  ', completed_at: '2026-08-24T10:00:00Z' }])
        expect(m.has(chave('SEG · Upper B'))).toBe(true)
    })

    it('cai para `date` quando não há `completed_at`', () => {
        const m = buildLastPerformedMap([{ name: 'A', date: '2026-08-22T10:00:00Z' }])
        expect(m.get(chave('A'))).toBe(new Date('2026-08-22T10:00:00Z').getTime())
    })

    it('ignora linha sem nome ou sem data válida, em vez de gravar lixo', () => {
        const m = buildLastPerformedMap([
            { name: '', completed_at: '2026-08-22T10:00:00Z' },
            { name: 'B', completed_at: 'não é data' },
            { name: 'C', completed_at: null },
        ])
        expect(m.size).toBe(0)
    })
})

describe('formatarUltimaVez', () => {
    const agora = new Date('2026-08-28T15:00:00Z') // 12h de 28/08 em BRT

    it('hoje e ontem têm nome próprio', () => {
        expect(formatarUltimaVez(new Date('2026-08-28T11:00:00Z').getTime(), agora)).toBe('hoje')
        expect(formatarUltimaVez(new Date('2026-08-27T11:00:00Z').getTime(), agora)).toBe('ontem')
    })

    it('conta por DIA-calendário, não por 24 horas', () => {
        // 26/08 às 22h BRT = 27/08 01:00Z. Da manhã de 28/08 são ~34 h — mas
        // são DOIS dias de calendário, que é como a pessoa conta.
        expect(formatarUltimaVez(new Date('2026-08-27T01:00:00Z').getTime(), agora)).toBe('há 2 dias')
    })

    it('vira semanas e meses quando faz sentido', () => {
        expect(formatarUltimaVez(new Date('2026-08-20T12:00:00Z').getTime(), agora)).toBe('há 1 semana')
        expect(formatarUltimaVez(new Date('2026-08-08T12:00:00Z').getTime(), agora)).toBe('há 2 semanas')
        expect(formatarUltimaVez(new Date('2026-06-20T12:00:00Z').getTime(), agora)).toBe('há 2 meses')
    })

    it('sem execução, string VAZIA — treino novo não nasce com carimbo de cobrança', () => {
        expect(formatarUltimaVez(null, agora)).toBe('')
        expect(formatarUltimaVez(undefined, agora)).toBe('')
        expect(formatarUltimaVez(Number.NaN, agora)).toBe('')
    })

    it('data no futuro não vira frase', () => {
        expect(formatarUltimaVez(new Date('2026-09-10T12:00:00Z').getTime(), agora)).toBe('')
    })
})

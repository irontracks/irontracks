/**
 * O resumo que o professor lê de relance: progresso, tempo e exercício da vez.
 *
 * Os dois invariantes que mais custam se quebrarem, e por quê:
 *
 * ⚠️ **Peso digitado NÃO é série feita.** O painel grava `{ weight: '80' }` sem
 * `done` e sem `weightSource`, e `isLogDone` trata log legado assim como FEITO.
 * Um contador que usasse `isLogDone` subiria a cada carga digitada e mostraria
 * ao professor um treino mais adiantado do que está — a mesma classe do bug de
 * 05/09/2026 que fazia sessões de 1 série reais aparecerem como "29/30".
 *
 * ⚠️ **O tempo é de parede** e a tela rotula assim; aqui só se trava que ele
 * nunca é negativo e que sessão sem `startedAt` devolve `null` em vez de zero
 * (zero seria "começou agora", uma afirmação falsa).
 */
import { describe, it, expect } from 'vitest'
import {
    resumoDoControle,
    minutosDesde,
    formatarDuracaoCurta,
} from '@/lib/workout/resumoDoControle'

const AGORA = 1_760_000_000_000

const sessao = (over: Record<string, unknown> = {}) => ({
    startedAt: AGORA - 72 * 60_000,
    workout: {
        exercises: [
            { name: 'Supino', sets: 2 },
            { name: 'Remada', sets: 2 },
        ],
    },
    logs: {},
    ...over,
})

describe('progresso — só conta o que está CONCLUÍDO', () => {
    it('conta as séries com done === true', () => {
        const r = resumoDoControle(
            sessao({ logs: { '0-0': { done: true }, '0-1': { done: true }, '1-0': { done: true } } }),
            AGORA,
        )
        expect(r.feitas).toBe(3)
        expect(r.total).toBe(4)
    })

    it('⚠️ peso digitado pelo professor NÃO vira série feita', () => {
        // Este é o caso que motivou o guard: `{ weight: '80' }` é exatamente o
        // que o painel grava ao digitar a carga, e `isLogDone` diria FEITO.
        const r = resumoDoControle(sessao({ logs: { '0-0': { weight: '80', reps: '10' } } }), AGORA)
        expect(r.feitas).toBe(0)
    })

    it('conta a série ACRESCENTADA na sessão, que só existe em setDetails', () => {
        // `Number(ex.sets)` sozinho devolveria 2 e a 3ª série sumiria da conta.
        const r = resumoDoControle(
            sessao({
                workout: { exercises: [{ name: 'Supino', sets: 2, setDetails: [{}, {}, {}] }] },
                logs: { '0-2': { done: true } },
            }),
            AGORA,
        )
        expect(r.total).toBe(3)
        expect(r.feitas).toBe(1)
    })

    it('exercício sem nenhuma série concluída é contado', () => {
        const r = resumoDoControle(sessao({ logs: { '0-0': { done: true } } }), AGORA)
        expect(r.exerciciosSemSerie).toBe(1)
    })

    it('treino vazio devolve total 0 (a tela esconde o resumo)', () => {
        expect(resumoDoControle({ workout: { exercises: [] } }, AGORA).total).toBe(0)
        expect(resumoDoControle(null, AGORA).total).toBe(0)
    })
})

describe('exercício da vez', () => {
    it('a execução em curso vence — é a série que o aluno está fazendo AGORA', () => {
        const r = resumoDoControle(
            sessao({ ui: { activeExecution: { key: '1-0', startedAtMs: AGORA } } }),
            AGORA,
        )
        expect(r.exercicioAtualIdx).toBe(1)
    })

    it('sem execução em curso, é o primeiro exercício com série pendente', () => {
        const r = resumoDoControle(
            sessao({ logs: { '0-0': { done: true }, '0-1': { done: true } } }),
            AGORA,
        )
        expect(r.exercicioAtualIdx).toBe(1)
    })

    it('⚠️ carimbo apontando para exercício que não existe mais é ignorado', () => {
        // O professor pode ter removido exercícios depois do carimbo; destacar
        // um índice fora da lista acenderia o card errado.
        const r = resumoDoControle(
            sessao({ ui: { activeExecution: { key: '9-0', startedAtMs: AGORA } } }),
            AGORA,
        )
        expect(r.exercicioAtualIdx).toBe(0)
    })

    it('treino todo concluído não tem "da vez"', () => {
        const r = resumoDoControle(
            sessao({
                logs: {
                    '0-0': { done: true }, '0-1': { done: true },
                    '1-0': { done: true }, '1-1': { done: true },
                },
            }),
            AGORA,
        )
        expect(r.exercicioAtualIdx).toBeNull()
    })
})

describe('tempo de parede', () => {
    it('conta os minutos desde o início', () => {
        expect(resumoDoControle(sessao(), AGORA).minutosDesdeInicio).toBe(72)
    })

    it('sessão sem início devolve null, nunca zero', () => {
        // Zero seria "começou agora" — uma afirmação, e falsa.
        expect(minutosDesde(undefined, AGORA)).toBeNull()
        expect(minutosDesde(0, AGORA)).toBeNull()
    })

    it('nunca é negativo, mesmo com relógios discordando', () => {
        expect(minutosDesde(AGORA + 60_000, AGORA)).toBe(0)
    })

    it('formata curto e em pt-BR', () => {
        expect(formatarDuracaoCurta(0)).toBe('agora')
        expect(formatarDuracaoCurta(47)).toBe('47min')
        expect(formatarDuracaoCurta(60)).toBe('1h')
        expect(formatarDuracaoCurta(72)).toBe('1h12')
        expect(formatarDuracaoCurta(65)).toBe('1h05')
        expect(formatarDuracaoCurta(null)).toBe('')
    })
})

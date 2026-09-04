import { describe, it, expect } from 'vitest'
import { minutosDeCardioFeitos, minutosDeCardioParaExibir, minutosPlanejados } from '../minutosDeCardio'

/**
 * O caso REAL que originou o módulo (04/09/2026): o dono fez 30 min de esteira
 * e o Story publicou "20min" — o tempo PLANEJADO no editor.
 *
 * Números da sessão dele, conferidos no banco: `reps` = 20 (plano),
 * log `durationSeconds` = 1803 (30,05 min).
 */
const esteira = { name: 'Esteira', method: 'Cardio', sets: 1, reps: '20' }
const logDoDono = { '6-0': { done: true, durationSeconds: 1803, speed: 6, incline: 0 } }

describe('o caso do dono: 30 min feitos, 20 no plano', () => {
    it('o feito é 30, não 20', () => {
        expect(Math.round(minutosDeCardioFeitos(logDoDono, 6, esteira))).toBe(30)
    })

    it('o Story publica 30 — era isso que saía errado', () => {
        expect(Math.round(minutosDeCardioParaExibir(logDoDono, 6, esteira))).toBe(30)
    })

    it('o planejado continua sendo 20, e é só fallback', () => {
        expect(minutosPlanejados(esteira)).toBe(20)
    })
})

describe('cardio em BLOCOS soma os blocos', () => {
    it('5 + 10 + 15 devolve 30', () => {
        const blocos = {
            '0-0': { done: true, durationSeconds: 5 * 60 },
            '0-1': { done: true, durationSeconds: 10 * 60 },
            '0-2': { done: true, durationSeconds: 15 * 60 },
        }
        expect(Math.round(minutosDeCardioFeitos(blocos, 0, esteira))).toBe(30)
    })
})

describe('as duas regras são diferentes de propósito', () => {
    /**
     * CALORIA: sem execução, zero — inflar gasto de quem não fez foi o defeito
     * de ago/2026.
     * STORY: sem execução, mostra o planejado — o caso real é a aula de FitDance
     * (jul/2026), que acontece FORA do app e não tem log nenhum; sem isso a
     * linha sumia da tabela em silêncio.
     */
    const semLog = {}

    it('sem execução, a CALORIA não conta nada', () => {
        expect(minutosDeCardioFeitos(semLog, 0, esteira)).toBe(0)
    })

    it('sem execução, o STORY ainda mostra o planejado', () => {
        expect(minutosDeCardioParaExibir(semLog, 0, esteira)).toBe(20)
    })

    it('série marcada como NÃO feita não vira tempo', () => {
        const naoFeita = { '0-0': { done: false, durationSeconds: 1800 } }
        expect(minutosDeCardioFeitos(naoFeita, 0, esteira)).toBe(0)
    })

    it('concluiu sem cronômetro cai no planejado — a pessoa afirmou que fez', () => {
        const semDuracao = { '0-0': { done: true } }
        expect(minutosDeCardioFeitos(semDuracao, 0, esteira)).toBe(20)
    })
})

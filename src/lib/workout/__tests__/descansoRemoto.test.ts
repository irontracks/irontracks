/**
 * O descanso que o professor dispara — e pula — no aparelho do aluno.
 *
 * Pedido do dono (12/09/2026): "quando eu colocar Concluir dispara o descanso
 * pra ele, e aparece pra mim também, e eu posso pular o descanso como se fosse
 * ele — caso eu queira que naquela série não tenha tanto descanso".
 *
 * Os dois invariantes que decidem se isso funciona no aparelho estão aqui: o
 * alvo é ABSOLUTO (relógios diferentes) e precisa ficar acima da folga do
 * `sanitizeRestoredSession`, senão o app do aluno o entende como descanso
 * vencido e abre em modo silencioso — sem alarme.
 */
import { describe, it, expect } from 'vitest'
import {
    descansoAoConcluir,
    pularDescanso,
    descansoEmAndamento,
    segundosRestantes,
    MINIMO_PARA_DESCANSO_REMOTO_S,
} from '../descansoRemoto'

const AGORA = 1_760_000_000_000

describe('descansoAoConcluir', () => {
    it('monta o alvo ABSOLUTO a partir do descanso do exercício', () => {
        const p = descansoAoConcluir({ restTime: 180, key: '0-0', nextKey: '0-1', agoraMs: AGORA })
        expect(p?.timerTargetTime).toBe(AGORA + 180_000)
        expect(p?.timerContext).toMatchObject({
            kind: 'rest',
            key: '0-0',
            nextKey: '0-1',
            restStartedAtMs: AGORA,
            origem: 'teacher',
        })
    })

    it('⚠️ o alvo é instante, não duração — atraso de rede ENCURTA, nunca estica', () => {
        // Os dois aparelhos têm relógios diferentes. Mandar "180 s" obrigaria os
        // dois a concordarem sobre quando a contagem começou. Com instante, o
        // aluno que recebe 2 s depois descansa 178 — erro no lado seguro.
        const p = descansoAoConcluir({ restTime: 180, key: '0-0', agoraMs: AGORA })
        const recebidoDepois = AGORA + 2000
        expect(segundosRestantes(p?.timerTargetTime, recebidoDepois)).toBe(178)
    })

    it('sem descanso configurado, não promete nada', () => {
        expect(descansoAoConcluir({ restTime: 0, key: '0-0', agoraMs: AGORA })).toBeNull()
        expect(descansoAoConcluir({ restTime: null, key: '0-0', agoraMs: AGORA })).toBeNull()
        expect(descansoAoConcluir({ restTime: 'abc', key: '0-0', agoraMs: AGORA })).toBeNull()
    })

    it('⚠️ descanso curto demais NÃO vira timer remoto', () => {
        // Abaixo da folga de 5 s do `sanitizeRestoredSession`, o app do aluno
        // entende "venceu enquanto eu estava fechado" e abre em modo silencioso:
        // sem alarme, sem flash. Melhor não prometer do que prometer mudo.
        expect(descansoAoConcluir({ restTime: MINIMO_PARA_DESCANSO_REMOTO_S - 1, key: '0-0', agoraMs: AGORA }))
            .toBeNull()
        expect(descansoAoConcluir({ restTime: MINIMO_PARA_DESCANSO_REMOTO_S, key: '0-0', agoraMs: AGORA }))
            .not.toBeNull()
    })

    it('última série do exercício não aponta para uma próxima que não existe', () => {
        const p = descansoAoConcluir({ restTime: 90, key: '0-3', nextKey: null, agoraMs: AGORA })
        expect(p?.timerContext?.nextKey).toBeNull()
    })

    it('sem chave de série não monta patch (log órfão não vira descanso)', () => {
        expect(descansoAoConcluir({ restTime: 90, key: '  ', agoraMs: AGORA })).toBeNull()
    })
})

describe('pularDescanso', () => {
    it('limpa o alvo E o contexto', () => {
        // Só zerar o alvo deixaria o contexto órfão sobreviver ao próximo patch,
        // e a barra do aluno reabriria no primeiro re-render.
        expect(pularDescanso()).toEqual({ timerTargetTime: null, timerContext: null })
    })
})

describe('leitura do descanso (os dois lados usam a mesma conta)', () => {
    it('em andamento enquanto o alvo está no futuro', () => {
        expect(descansoEmAndamento(AGORA + 1000, AGORA)).toBe(true)
        expect(descansoEmAndamento(AGORA, AGORA)).toBe(false)
        expect(descansoEmAndamento(AGORA - 1, AGORA)).toBe(false)
    })

    it('sem alvo, não há descanso', () => {
        expect(descansoEmAndamento(null, AGORA)).toBe(false)
        expect(descansoEmAndamento(0, AGORA)).toBe(false)
        expect(descansoEmAndamento('abc', AGORA)).toBe(false)
    })

    it('o restante nunca fica negativo — zero é o fim, não o começo do atraso', () => {
        expect(segundosRestantes(AGORA + 90_000, AGORA)).toBe(90)
        expect(segundosRestantes(AGORA - 30_000, AGORA)).toBe(0)
        expect(segundosRestantes(null, AGORA)).toBe(0)
    })
})

/**
 * Motor de carga automática — as travas e os ramos que faltavam.
 *
 * Este é o cálculo com maior consequência do app: o número que ele devolve é a
 * carga que o usuário vai levantar. Cada trava aqui existe por um motivo de
 * segurança ou de fisiologia, e o teste diz qual.
 */
import { describe, it, expect } from 'vitest'
import { suggestWeight, readinessFactor, estimateE1RM, usableTodaySignal } from '../suggestWeight'

const hist = (sets: Array<{ weight: number; reps: number; rpe?: number; failed?: boolean }>) => sets

describe('prontidão só AMORTECE — nunca empurra carga para cima', () => {
    it('sem check-in, fator neutro', () => {
        expect(readinessFactor(undefined)).toEqual({ factor: 1, reason: null })
        expect(readinessFactor({})).toEqual({ factor: 1, reason: null })
    })

    it('cada sinal ruim desconta, e o motivo é dito', () => {
        const sonoCurto = readinessFactor({ sleepHours: 4 })
        expect(sonoCurto.factor).toBeLessThan(1)
        expect(sonoCurto.reason).toMatch(/sono/)

        const dor = readinessFactor({ soreness: 8 })
        expect(dor.factor).toBeLessThan(1)
        expect(dor.reason).toMatch(/dor/)

        const energia = readinessFactor({ energy: 1 })
        expect(energia.factor).toBeLessThan(1)
        expect(energia.reason).toMatch(/energia/)
    })

    it('há degraus: ruim desconta mais que mediano', () => {
        expect(readinessFactor({ sleepHours: 4 }).factor).toBeLessThan(readinessFactor({ sleepHours: 6 }).factor)
        expect(readinessFactor({ soreness: 8 }).factor).toBeLessThan(readinessFactor({ soreness: 5 }).factor)
        expect(readinessFactor({ energy: 1 }).factor).toBeLessThan(readinessFactor({ energy: 2 }).factor)
    })

    it('vários sinais somam motivos e respeitam o PISO de segurança', () => {
        const r = readinessFactor({ sleepHours: 3, soreness: 9, energy: 1 })
        expect(r.reason).toMatch(/\+/)
        expect(r.factor).toBeGreaterThan(0.5) // clampado, não despenca
        expect(r.factor).toBeLessThan(1)
    })

    it('dia bom não passa de 1 — prontidão não é bônus', () => {
        expect(readinessFactor({ sleepHours: 10, soreness: 0, energy: 5 }).factor).toBe(1)
    })
})

describe('e1RM e sinal do dia', () => {
    it('estima o 1RM da série', () => {
        expect(estimateE1RM({ weight: 100, reps: 1, rpe: 10 })).toBeGreaterThan(0)
        expect(estimateE1RM({ weight: 0, reps: 10 } as never)).toBeNull()
    })

    it('sinal do dia sem RPE ou sem peso não serve para calibrar', () => {
        expect(usableTodaySignal(null)).toBeNull()
        expect(usableTodaySignal({ weight: 0, reps: 10, rpe: 8 } as never)).toBeNull()
    })
})

describe('suggestWeight — travas de segurança', () => {
    const base = { targetReps: 10, targetRpe: 8, equipment: ['barra'] }

    it('sem histórico e sem carga externa, progride por REPS', () => {
        const r = suggestWeight({ ...base, equipment: ['peso_corporal'], history: [] })
        expect(r.weight).toBeNull()
        expect(r.rationale).toMatch(/repeti/i)
    })

    it('exercício "de peso corporal" COM histórico de kg é tratado como carga', () => {
        // "Abdominal infra" feito com 50 kg no cabo — o histórico manda.
        const r = suggestWeight({ ...base, equipment: ['peso_corporal'], history: hist([{ weight: 50, reps: 12, rpe: 8 }]) })
        expect(r.weight).toBeGreaterThan(0)
    })

    it('trava anti-regressão: num dia normal não sugere MENOS que a maior carga', () => {
        const r = suggestWeight({ ...base, history: hist([{ weight: 100, reps: 10, rpe: 8 }, { weight: 90, reps: 12, rpe: 7 }]) })
        expect(r.weight!).toBeGreaterThanOrEqual(100)
    })

    it('teto de +10% por sessão — nem com histórico ótimo salta mais', () => {
        const r = suggestWeight({ ...base, targetReps: 3, history: hist([{ weight: 100, reps: 12, rpe: 6 }]) })
        expect(r.weight!).toBeLessThanOrEqual(110)
    })

    it('série à FALHA congela a carga — não progride em cima de quem estourou', () => {
        const comFalha = suggestWeight({ ...base, history: hist([{ weight: 100, reps: 10, rpe: 10, failed: true }]) })
        const semFalha = suggestWeight({ ...base, history: hist([{ weight: 100, reps: 10, rpe: 10 }]) })
        expect(comFalha.weight!).toBeLessThanOrEqual(semFalha.weight!)
        expect(comFalha.weight!).toBeLessThanOrEqual(100)
    })

    it('prontidão ruim reduz a sugestão e EXPLICA', () => {
        const r = suggestWeight({
            ...base,
            history: hist([{ weight: 100, reps: 10, rpe: 8 }]),
            readiness: { sleepHours: 3, soreness: 9, energy: 1 },
        })
        expect(r.weight!).toBeLessThan(100)
        expect(r.rationale).toMatch(/sono|dor|energia/)
    })

    it('cold start: sem histórico, o reconhecimento de hoje calibra', () => {
        const r = suggestWeight({ ...base, history: [], todaySignal: { weight: 80, reps: 8, rpe: 8 } })
        expect(r.weight).toBeGreaterThan(0)
        expect(r.confidence).toBe('medium')
    })

    it('reconhecimento pior que o histórico AUTORIZA reduzir — é medição, não chute', () => {
        const historico = hist([{ weight: 100, reps: 10, rpe: 8 }])
        const semSinal = suggestWeight({ ...base, history: historico })
        const comSinalRuim = suggestWeight({ ...base, history: historico, todaySignal: { weight: 70, reps: 8, rpe: 9 } })
        expect(comSinalRuim.weight!).toBeLessThan(semSinal.weight!)
        expect(comSinalRuim.rationale).toMatch(/reconhecimento/i)
    })

    it('reconhecimento com RPE impreciso (longe da falha) não empurra carga', () => {
        const historico = hist([{ weight: 100, reps: 10, rpe: 8 }])
        const rpeBaixo = suggestWeight({ ...base, history: historico, todaySignal: { weight: 120, reps: 8, rpe: 5 } })
        expect(rpeBaixo.weight!).toBeLessThanOrEqual(110)
    })

    it('base em exercício SUBSTITUTO reduz a confiança e é dito', () => {
        const r = suggestWeight({ ...base, history: hist([{ weight: 100, reps: 10, rpe: 8 }]), fromSubstitute: true })
        expect(r.confidence).toBe('low')
        expect(r.rationale).toMatch(/similar/i)
    })

    it('sem RPE no histórico, a confiança cai para média', () => {
        const r = suggestWeight({ ...base, history: hist([{ weight: 100, reps: 10 }]) })
        expect(r.confidence).toBe('medium')
    })

    it('deload desligado segura a carga e explica por quê', () => {
        const r = suggestWeight({
            ...base,
            history: hist([{ weight: 100, reps: 10, rpe: 8 }]),
            readiness: { sleepHours: 3, soreness: 9, energy: 1 },
            deloadEnabled: false,
        })
        expect(r.weight!).toBeGreaterThanOrEqual(100)
        expect(r.rationale).toMatch(/deload/i)
    })

    it('a explicação diz se subiu, manteve ou ajustou', () => {
        const r = suggestWeight({ ...base, history: hist([{ weight: 100, reps: 10, rpe: 8 }]) })
        expect(r.rationale).toMatch(/subi|mantém|ajustei/)
        expect(r.rationale).toMatch(/Última vez/)
    })

    it('grade aprendida da máquina é usada e anunciada', () => {
        const r = suggestWeight({
            ...base,
            history: hist([{ weight: 32, reps: 10, rpe: 8 }]),
            equipment: ['maquina'],
            knownWeights: [18, 23, 27, 32, 36, 41],
        })
        expect(r.weight).toBeGreaterThan(0)
    })

    it('histórico só com lixo é tratado como sem histórico', () => {
        const r = suggestWeight({ ...base, history: hist([{ weight: 0, reps: 0 }, { weight: -5, reps: 10 }]) })
        expect(r.weight).toBeNull()
    })

    it('alvo de reps ausente cai nas reps do histórico', () => {
        const r = suggestWeight({ ...base, targetReps: 0, history: hist([{ weight: 100, reps: 8, rpe: 8 }]) })
        expect(r.weight).toBeGreaterThan(0)
    })
})

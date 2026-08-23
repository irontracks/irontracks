/**
 * Duração estimada do treino — o "~91 min" que aparece no card.
 *
 * Fecha o buraco de cobertura achado ao responder "essa área está 100%?":
 * `pacing.ts` estava em 60% de linhas e 47% de branches, e é o número que o
 * usuário lê antes de decidir se dá tempo de treinar.
 *
 * As duas regras que valem mais que o total: a **cadência** vem da soma dos
 * dígitos (um "3010" são 3+0+1+0 = 4 s por rep, não três mil e dez), e num
 * **grupo** (Bi-Set/Tri-Set) o descanso não se repete por exercício — o enunciado
 * do método é "0 s entre eles", então o par executa e descansa UMA vez por ciclo.
 */
import { describe, it, expect } from 'vitest'
import {
    parseCadenceSecondsPerRep,
    calculateExerciseDuration,
    estimateWorkoutSeconds,
    calculateExerciseDurationForGroup,
    estimateWorkoutSecondsForGroup,
} from '../pacing'

describe('parseCadenceSecondsPerRep', () => {
    it('soma os dígitos da cadência', () => {
        expect(parseCadenceSecondsPerRep('3010')).toBe(4)
        expect(parseCadenceSecondsPerRep('2020')).toBe(4)
        expect(parseCadenceSecondsPerRep('4141')).toBe(10)
    })

    it('cadência ausente ou sem dígito cai no padrão', () => {
        const padrao = parseCadenceSecondsPerRep('')
        expect(parseCadenceSecondsPerRep(undefined)).toBe(padrao)
        expect(parseCadenceSecondsPerRep('livre')).toBe(padrao)
        expect(padrao).toBeGreaterThan(0)
    })

    it('ignora separadores', () => {
        expect(parseCadenceSecondsPerRep('3-0-1-0')).toBe(4)
    })
})

describe('duração de um exercício', () => {
    const base = { sets: '4', reps: '10', restTime: '60', cadence: '2020' }

    it('soma execução + descanso de cada série', () => {
        // perRep 4 × 10 reps = 40 s de execução + overhead, mais 60 s de descanso,
        // tudo × 4 séries.
        const total = calculateExerciseDuration(base)
        expect(total).toBeGreaterThan(4 * (40 + 60))
        expect(total).toBeLessThan(4 * (40 + 60 + 60))
    })

    it('mais séries = mais tempo; mais descanso = mais tempo', () => {
        expect(calculateExerciseDuration({ ...base, sets: '5' }))
            .toBeGreaterThan(calculateExerciseDuration(base))
        expect(calculateExerciseDuration({ ...base, restTime: '120' }))
            .toBeGreaterThan(calculateExerciseDuration(base))
    })

    it('entrada vazia ou nula não quebra a conta do treino', () => {
        expect(calculateExerciseDuration(null)).toBe(0)
        expect(calculateExerciseDuration({})).toBeGreaterThan(0) // usa os padrões
    })

    it('cardio conta os minutos planejados, não séries×reps', () => {
        const cardio = { method: 'cardio', name: 'Esteira', reps: '20' }
        expect(calculateExerciseDuration(cardio)).toBe(20 * 60)
    })

    it('bike outdoor sem tempo declarado não inventa duração', () => {
        // Pedal na rua não tem duração previsível — 0 é melhor que um palpite.
        expect(calculateExerciseDuration({ method: 'cardio', name: 'Bike outdoor', reps: '' })).toBe(0)
        // Com tempo declarado, respeita.
        expect(calculateExerciseDuration({ method: 'cardio', name: 'Bike outdoor', reps: '30' })).toBe(30 * 60)
    })

    it('cardio de esteira sem tempo cai num padrão (não zera o treino)', () => {
        expect(calculateExerciseDuration({ method: 'cardio', name: 'Esteira', reps: '' })).toBeGreaterThan(0)
    })
})

describe('treino inteiro', () => {
    it('soma os exercícios', () => {
        const ex = { sets: '3', reps: '10', restTime: '60', cadence: '2020' }
        expect(estimateWorkoutSeconds([ex, ex])).toBe(calculateExerciseDuration(ex) * 2)
    })

    it('lista vazia é zero', () => {
        expect(estimateWorkoutSeconds([])).toBe(0)
    })
})

describe('grupo (Bi-Set / Tri-Set) — o descanso não se repete por exercício', () => {
    const ex = { sets: '4', reps: '10', restTime: '60', cadence: '2020' }

    it('um par leva MENOS que os dois exercícios soltos', () => {
        // Soltos: cada um descansa 60 s por série. No Bi-Set, o descanso é do
        // ciclo — "0 s entre eles" é o enunciado do método.
        const grupo = calculateExerciseDurationForGroup(ex, 2)
        const soltos = calculateExerciseDuration(ex) * 2
        expect(grupo).toBeLessThan(soltos)
    })

    it('mas MAIS que um exercício sozinho — o trabalho dobrou', () => {
        expect(calculateExerciseDurationForGroup(ex, 2)).toBeGreaterThan(calculateExerciseDuration(ex))
    })

    it('grupo de 1 (ou inválido) é o cálculo normal', () => {
        for (const size of [1, 0, -3, NaN]) {
            expect(calculateExerciseDurationForGroup(ex, size), `size ${size}`)
                .toBe(calculateExerciseDuration(ex))
        }
    })

    it('tri-set leva mais que bi-set', () => {
        expect(calculateExerciseDurationForGroup(ex, 3))
            .toBeGreaterThan(calculateExerciseDurationForGroup(ex, 2))
    })

    it('a versão de treino inteiro concorda com a de exercício', () => {
        expect(estimateWorkoutSecondsForGroup([ex, ex], 2))
            .toBe(calculateExerciseDurationForGroup(ex, 2) * 2)
        expect(estimateWorkoutSecondsForGroup([ex], 1)).toBe(estimateWorkoutSeconds([ex]))
    })
})

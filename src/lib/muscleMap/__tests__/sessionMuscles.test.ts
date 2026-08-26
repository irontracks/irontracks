/**
 * Guards do dado que acende o manequim do Story.
 *
 * O que se protege aqui é a HONESTIDADE do desenho: um manequim que pinta
 * músculo de série não concluída, ou que acende perna por causa de uma esteira,
 * publica uma afirmação falsa sobre o treino de quem compartilhou.
 */
import { describe, it, expect } from 'vitest'
import { buildSessionMuscles } from '../sessionMuscles'

const sessaoBase = () => ({
    exercises: [
        { name: 'Supino reto' },
        { name: 'Rosca direta' },
        { name: 'Esteira', type: 'cardio', reps: 20 },
        { name: 'Xablau invencível do professor' },
    ],
    logs: {
        '0-0': { done: true, weight: 80, reps: 8 },
        '0-1': { done: true, weight: 80, reps: 8 },
        '0-2': { done: false }, // planejada, sem nada registrado
        '1-0': { done: true, weight: 20, reps: 10 },
        '3-0': { done: true, weight: 10, reps: 10 },
    },
})

describe('buildSessionMuscles', () => {
    it('mapeia os músculos dos exercícios concluídos', () => {
        const m = buildSessionMuscles(sessaoBase())
        expect(Object.keys(m).sort()).toEqual(
            ['biceps', 'chest', 'delts_front', 'forearms', 'triceps'].sort(),
        )
    })

    it('o músculo mais trabalhado da sessão vale ratio 1', () => {
        const m = buildSessionMuscles(sessaoBase())
        expect(m.chest?.ratio).toBe(1)
        // e o resto é relativo a ele, nunca acima
        Object.values(m).forEach((v) => expect(v.ratio).toBeLessThanOrEqual(1))
    })

    it('série NÃO concluída não pinta músculo', () => {
        const comTres = sessaoBase()
        const semATerceira = sessaoBase()
        delete (semATerceira.logs as Record<string, unknown>)['0-2']
        // A terceira série do supino está planejada e vazia: incluí-la
        // mudaria o volume do peitoral. Os dois cenários têm que dar o MESMO
        // número — é isso que prova que ela ficou de fora.
        expect(buildSessionMuscles(comTres).chest?.setsEq)
            .toBe(buildSessionMuscles(semATerceira).chest?.setsEq)
    })

    it('concluir a terceira série AUMENTA o volume do peitoral', () => {
        // Contraprova do caso acima: sem ela, o teste anterior passaria mesmo
        // com o cálculo ignorando os logs por inteiro.
        const base = sessaoBase()
        const comTerceiraFeita = sessaoBase()
        ;(comTerceiraFeita.logs as Record<string, unknown>)['0-2'] = { done: true, weight: 80, reps: 8 }
        expect(Number(buildSessionMuscles(comTerceiraFeita).chest?.setsEq))
            .toBeGreaterThan(Number(buildSessionMuscles(base).chest?.setsEq))
    })

    it('exercício marcado como CARDIO não acende músculo', () => {
        // O nome importa para o teste ter efeito: "Esteira" e "Corrida" não
        // são reconhecidos pela heurística e ficariam de fora de qualquer
        // jeito — um caso assim passa verde com o filtro removido (medido).
        // Quem o filtro de fato protege é o exercício de nome RECONHECÍVEL
        // classificado como cardio, cuja série não é volume de musculação.
        const so = {
            exercises: [{ name: 'Agachamento livre', type: 'cardio', reps: 30 }],
            logs: { '0-0': { done: true, reps: 1 } },
        }
        expect(buildSessionMuscles(so)).toEqual({})
    })

    it('o MESMO exercício sem a marca de cardio acende a perna', () => {
        // Contraprova: sem isto, o caso acima passaria com a heurística muda.
        const so = {
            exercises: [{ name: 'Agachamento livre' }],
            logs: { '0-0': { done: true, weight: 100, reps: 5 } },
        }
        expect(Object.keys(buildSessionMuscles(so))).toContain('quads')
    })

    it('exercício que a heurística não conhece não quebra nem pinta', () => {
        const so = {
            exercises: [{ name: 'Xablau invencível do professor' }],
            logs: { '0-0': { done: true, weight: 10, reps: 10 } },
        }
        expect(buildSessionMuscles(so)).toEqual({})
    })

    it('sessão vazia, nula ou malformada devolve mapa vazio', () => {
        expect(buildSessionMuscles(null)).toEqual({})
        expect(buildSessionMuscles({})).toEqual({})
        expect(buildSessionMuscles({ exercises: 'nada', logs: 7 })).toEqual({})
    })
})

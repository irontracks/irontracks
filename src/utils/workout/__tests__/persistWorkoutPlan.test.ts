import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
    flushPendingWorkoutsRefresh,
    notifyWorkoutsChanged,
    __resetPendingWorkoutsRefresh,
} from '@/utils/workout/persistWorkoutPlan'

/**
 * REGRESSÃO GRAVE (ago/2026): "o modal de treino ativo está fechando sozinho".
 *
 * Causa: a invalidação da lista de treinos foi ligada nas gravações do treino
 * ativo. O refetch substitui o array de treinos por objetos novos — a RPC
 * `save_workout_atomic` recria os exercícios, então até os ids mudam — e isso
 * remontava a tela da sessão em andamento. Perder a sessão no meio da série é o
 * pior estrago possível nesta feature.
 *
 * Regra: durante o treino, a invalidação fica REPRESADA; ao sair, é solta.
 */
describe('invalidação represada durante o treino ativo', () => {
    let dispatched: string[]

    beforeEach(() => {
        __resetPendingWorkoutsRefresh()
        dispatched = []
        vi.stubGlobal('window', {
            dispatchEvent: (e: Event) => { dispatched.push(e.type); return true },
            CustomEvent: globalThis.CustomEvent,
        })
    })
    afterEach(() => { vi.unstubAllGlobals(); __resetPendingWorkoutsRefresh() })

    it('sem defer, avisa na hora', () => {
        notifyWorkoutsChanged()
        expect(dispatched).toEqual(['irontracks:workouts-changed'])
    })

    it('com defer, NÃO avisa — é o que impedia o modal de fechar sozinho', () => {
        notifyWorkoutsChanged({ defer: true })
        expect(dispatched).toEqual([])
    })

    it('o flush solta o aviso represado uma única vez', () => {
        notifyWorkoutsChanged({ defer: true })
        notifyWorkoutsChanged({ defer: true })
        flushPendingWorkoutsRefresh()
        expect(dispatched).toEqual(['irontracks:workouts-changed'])

        flushPendingWorkoutsRefresh()
        expect(dispatched).toHaveLength(1)
    })

    it('flush sem nada represado é no-op — não força refetch à toa', () => {
        flushPendingWorkoutsRefresh()
        expect(dispatched).toEqual([])
    })
})

describe('quem grava dentro do treino ativo represa a invalidação', () => {
    it('as três gravações de plano do treino ativo usam deferNotify', () => {
        const src = readFileSync('src/components/workout/hooks/useWorkoutExerciseCrud.ts', 'utf8')
        const chamadas = src.match(/persistWorkoutPlan\(/g) || []
        const comDefer = src.match(/deferNotify: true/g) || []
        expect(chamadas.length).toBeGreaterThanOrEqual(3)
        expect(comDefer.length).toBe(chamadas.length)
    })

    it('o app solta o represado ao SAIR do treino', () => {
        const src = readFileSync('src/app/(app)/dashboard/IronTracksAppClientImpl.tsx', 'utf8')
        expect(src).toContain('flushPendingWorkoutsRefresh')
        expect(src).toMatch(/wasActiveRef\.current && !isActive/)
    })
})

/**
 * A lista de treinos é cacheada NO SERVIDOR (bootstrap 300s, list 60s). Escrever
 * direto do browser deixava o cache intacto e o refetch trazia o dado velho por
 * até 5 minutos — "reordenei e ao iniciar o treino veio na ordem antiga".
 */
describe('escrita de exercício invalida o cache do servidor', () => {
    const rota = readFileSync('src/app/api/workouts/exercises/route.ts', 'utf8')

    it('a rota derruba os DOIS caches de lista', () => {
        expect(rota).toContain('dashboard:bootstrap:')
        expect(rota).toContain('workouts:list:')
        expect(rota).toContain('cacheDeletePattern')
    })

    it('as três ações (add/reorder/delete) passam pela invalidação', () => {
        expect((rota.match(/await invalidate\(user\.id\)/g) || []).length).toBe(3)
    })

    it('o client NÃO escreve mais direto no Supabase', () => {
        const actions = readFileSync('src/actions/workoutExercises-actions.ts', 'utf8')
        expect(actions).toContain('/api/workouts/exercises')
        expect(actions).not.toContain("from('exercises')")
        expect(actions).not.toContain('createClient')
    })

    it('não há duas portas para a mesma escrita', () => {
        // addExerciseToWorkout viveu em dois arquivos por um momento; duas portas
        // pra mesma escrita foi o que produziu a divergência que causou o bug.
        const gap = readFileSync('src/actions/muscleGap-actions.ts', 'utf8')
        expect(gap).not.toContain('addExerciseToWorkout')
    })
})

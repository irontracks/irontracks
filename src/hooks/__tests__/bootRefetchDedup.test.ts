/**
 * Guards do boot sem trabalho redundante (perf, ago/2026).
 *
 * Três desperdícios medidos na auditoria, cada um com seu invariante:
 *
 * 1. `useWorkoutFetch` refazia no CLIENT a mesma query que o SSR acabou de
 *    entregar (`initialDataUpdatedAt: 0` marcava o dado do servidor como
 *    velho). Para admin/teacher isso eram ~8-10 round-trips ao Supabase em
 *    série, do browser, em toda abertura. Agora só o cache de localStorage
 *    (que pode ser de dias atrás) força refetch.
 * 2. `hydrateWorkouts` do client buscava exercícios e DEPOIS séries, porque o
 *    filtro dependia dos ids. O servidor já resolvia isso com
 *    `exercises!inner(workout_id)` — sem a dependência, as duas queries vão em
 *    paralelo.
 * 3. `/api/gps/gyms` (dados do Apple Watch) disparava em TODO boot, inclusive
 *    na web onde não há Watch. Agora espera o bridge nativo.
 *
 * São source-guards: os três são invisíveis em teste de comportamento (o app
 * funciona igual, só mais devagar) — exatamente a classe de regressão que
 * volta em silêncio num refactor.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8')

describe('useWorkoutFetch: SSR não é refeito no client', () => {
    const src = read('../useWorkoutFetch.ts')

    it('initialDataUpdatedAt é condicional ao frescor (não é 0 fixo)', () => {
        // O invariante é "o valor sai de initialIsFreshRef, com Date.now() no ramo
        // fresco e 0 no outro" — não a FORMA como ele chega ao objeto do useQuery.
        // Em 09/08/2026 o cálculo saiu de dentro do config e virou um lazy
        // initializer de useState (o corpo do render precisava ficar puro para a
        // regra react-hooks/purity), e este guard falhou por casar a linha inteira.
        // Guard preso à forma vira atrito em refactor correto.
        expect(src).toMatch(/initialIsFreshRef\.current\s*\?\s*Date\.now\(\)\s*:\s*0/)
        expect(src, 'o valor precisa chegar ao useQuery').toMatch(/initialDataUpdatedAt:\s*\w+/)
        expect(src, 'o 0 fixo era o bug — marcava dado do SSR como velho')
            .not.toMatch(/initialDataUpdatedAt:\s*0\s*,/)
    })

    it('só o caminho do SSR marca o dado como fresco', () => {
        // Reset no topo do resolver + set único dentro do ramo de initialWorkouts.
        expect(src).toMatch(/initialIsFreshRef\.current = false/)
        const setsTrue = src.match(/initialIsFreshRef\.current = true/g) || []
        expect(setsTrue).toHaveLength(1)
        const idxTrue = src.indexOf('initialIsFreshRef.current = true')
        const idxLocalStorage = src.indexOf('readLocalStorageCache(userId)')
        expect(idxTrue, 'o marcador de fresco não pode cobrir o cache local')
            .toBeLessThan(idxLocalStorage)
    })
})

describe('hydrateWorkouts do client: exercícios e séries em paralelo', () => {
    const src = read('../useWorkoutFetch.ts')
    const fn = src.slice(src.indexOf('async function hydrateWorkouts'), src.indexOf('// Branching role-based'))

    it('usa Promise.all (não await sequencial)', () => {
        expect(fn).toContain('await Promise.all([')
    })

    it('séries filtram por workout via join inner (some a dependência dos ids)', () => {
        expect(fn).toContain('exercises!inner(workout_id)')
        expect(fn).toContain(".in('exercises.workout_id', workoutIds)")
    })

    it('não reintroduz o filtro por exIds (que forçava a serialização)', () => {
        expect(fn).not.toMatch(/\.in\('exercise_id',\s*exIds\)/)
    })
})

describe('/api/gps/gyms só em nativo', () => {
    const src = read('../../app/(app)/dashboard/IronTracksAppClientImpl.tsx')

    it('fetch fica atrás do gate de bridge nativo', () => {
        const idxGate = src.indexOf('if (!gymsBridgeReady) return')
        const idxFetch = src.indexOf("fetch('/api/gps/gyms')")
        expect(idxGate).toBeGreaterThan(-1)
        expect(idxFetch).toBeGreaterThan(idxGate)
    })

    it('espera o bridge em vez de desistir no 1º render (corrida conhecida)', () => {
        expect(src).toMatch(/gymsBridgeReady.*=.*useState<boolean>\(\(\) => isIosNative\(\)\)/)
        expect(src).toContain('setGymsBridgeReady(true)')
    })

    it('o effect reavalia quando o bridge fica pronto', () => {
        expect(src).toMatch(/\}, \[user\?\.id, gymsBridgeReady\]\)/)
    })
})

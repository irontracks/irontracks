/**
 * Guard do cache do volume total do Iron Rank (perf, ago/2026).
 *
 * Sintoma: `iron_rank_my_total_volume` varre TODOS os workouts do banco
 * (~95ms de Postgres) e era chamada a CADA visita ao dashboard — 11.750
 * execuções medidas. O custo cresce com a base inteira, não com o usuário.
 *
 * Invariantes:
 * 1. a RPC só roda em cache-miss (localStorage, TTL 30min);
 * 2. a chave inclui `totalWorkouts` — finalizar/excluir treino muda a
 *    contagem → chave nova → valor fresco (auto-invalidação). Sem isso o
 *    usuário terminaria um treino e o rank não subiria por meia hora.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const src = readFileSync(path.resolve(__dirname, '../workout-analytics-actions.ts'), 'utf8')

describe('cache do iron_rank_my_total_volume', () => {
    it('chave inclui user.id e totalWorkouts (auto-invalida ao finalizar treino)', () => {
        expect(src).toMatch(/ironRankVol\.\$\{user\.id\}\.\$\{totalWorkouts\}/)
    })

    it('RPC só roda em cache-miss', () => {
        const cacheIdx = src.indexOf('const cachedVol')
        const rpcIdx = src.indexOf("supabase.rpc('iron_rank_my_total_volume')")
        expect(cacheIdx).toBeGreaterThan(-1)
        expect(rpcIdx).toBeGreaterThan(cacheIdx)
        // A chamada precisa estar no ramo else do hit de cache.
        const between = src.slice(cacheIdx, rpcIdx)
        expect(between).toContain('if (cachedVol != null)')
    })

    it('TTL definido (staleness de edição de treino antigo é limitada)', () => {
        expect(src).toMatch(/VOL_CACHE_TTL_MS = 30 \* 60 \* 1000/)
    })
})

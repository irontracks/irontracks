/**
 * Guard do cache do streak (perf, ago/2026).
 *
 * `computeWorkoutStreakAndStats` varre os treinos do usuário e era refeita do
 * ZERO a cada montagem do dashboard — nenhum cache, nem em memória. Migrado
 * para React Query com staleTime.
 *
 * Invariantes:
 * 1. usa useQuery com staleTime > 0 (sem isso a migração não muda nada — o
 *    Query refetch em todo mount e o ganho evapora em silêncio);
 * 2. o setter otimista escreve NO CACHE do Query, não num useState paralelo —
 *    dois estados divergiriam no primeiro refetch, e o número do streak
 *    voltaria sozinho depois de uma atualização otimista.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const src = readFileSync(path.resolve(__dirname, '../useWorkoutStreak.ts'), 'utf8')

describe('useWorkoutStreak: cache entre montagens', () => {
    it('usa useQuery com staleTime > 0', () => {
        expect(src).toContain('useQuery<WorkoutStreak | null>')
        expect(src).toMatch(/STREAK_STALE_MS = \d+ \* 60_000/)
        expect(src).toContain('staleTime: STREAK_STALE_MS')
    })

    it('não voltou ao useState + useEffect (o padrão sem cache)', () => {
        expect(src).not.toMatch(/useState<WorkoutStreak \| null>/)
        expect(src, 'fetch em useEffect era o que refazia tudo a cada mount')
            .not.toMatch(/useEffect\(\(\) => \{[\s\S]{0,200}computeWorkoutStreakAndStats\(\)/)
    })

    it('setter otimista escreve no cache do Query (fonte única)', () => {
        expect(src).toContain('queryClient.setQueryData<WorkoutStreak | null>(queryKey')
    })

    it('preserva o contrato do hook (streakStats/setStreakStats/streakLoading)', () => {
        expect(src).toMatch(/streakStats:\s*query\.data \?\? null/)
        expect(src).toContain('setStreakStats,')
        expect(src).toMatch(/streakLoading:\s*!!userId && query\.isPending/)
    })
})

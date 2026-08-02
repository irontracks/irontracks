/**
 * Guard do dedup de auth no boot (perf, ago/2026).
 *
 * Sintoma: cada abertura do dashboard pagava `auth.getUser()` nos DOIS layouts
 * aninhados + `resolveRoleByUser` 2×, tudo em série, antes de qualquer dado —
 * ~300-600ms de abertura desperdiçados em toda navegação.
 *
 * Invariantes travados:
 * 1. serverAuthCache embrulha as resoluções em React.cache (dedup por request);
 * 2. os layouts (app) e dashboard usam o cache — NÃO chamam
 *    supabase.auth.getUser()/resolveRoleByUser direto (senão o dedup morre em
 *    silêncio e ninguém percebe: o app só fica lento de novo);
 * 3. o middleware fica FORA do dedup (o getUser dele refresca o cookie).
 * 4. resolveRoleByUser consulta as 3 fontes em paralelo (Promise.allSettled) —
 *    eram 3 round-trips em série no caminho crítico.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8')

describe('serverAuthCache', () => {
    const cacheSrc = read('../serverAuthCache.ts')

    it('usa React.cache nas duas resoluções', () => {
        expect(cacheSrc).toMatch(/import \{ cache \} from 'react'/)
        expect(cacheSrc).toMatch(/getRequestUser = cache\(/)
        expect(cacheSrc).toMatch(/getRequestRole = cache\(/)
    })
})

describe('layouts do boot usam o cache (não auth direto)', () => {
    const appLayout = read('../../../app/(app)/layout.tsx')
    const dashLayout = read('../../../app/(app)/dashboard/layout.tsx')

    for (const [nome, src] of [['(app)/layout', appLayout], ['dashboard/layout', dashLayout]] as const) {
        it(`${nome} resolve user/role via serverAuthCache`, () => {
            expect(src).toContain("from '@/utils/auth/serverAuthCache'")
            expect(src).toContain('getRequestUser()')
            expect(src).toContain('getRequestRole(')
        })

        it(`${nome} não chama supabase.auth.getUser() direto`, () => {
            expect(src).not.toMatch(/supabase\.auth\.getUser\(\)/)
        })

        it(`${nome} não chama resolveRoleByUser direto`, () => {
            expect(src).not.toMatch(/\bresolveRoleByUser\(/)
        })
    }
})

describe('middleware fica fora do dedup (refresca o cookie)', () => {
    it('updateSession continua com o getUser próprio', () => {
        const mw = read('../../supabase/middleware.ts')
        expect(mw).toMatch(/supabase\.auth\.getUser\(\)/)
        expect(mw).not.toContain('serverAuthCache')
    })
})

describe('resolveRoleByUser paraleliza as 3 fontes', () => {
    it('usa Promise.allSettled (não await em série)', () => {
        const route = read('../route.ts')
        const fn = route.slice(route.indexOf('export async function resolveRoleByUser'), route.indexOf('export async function requireRole'))
        expect(fn).toContain('Promise.allSettled')
    })
})

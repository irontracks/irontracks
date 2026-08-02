/**
 * Dedup de auth por request no SSR (perf, ago/2026).
 *
 * Sintoma: TODO boot do dashboard pagava `auth.getUser()` 2× nos layouts
 * aninhados ((app) → dashboard) e `resolveRoleByUser` 2× — tudo EM SÉRIE,
 * antes de qualquer dado começar a carregar (~300-600ms de abertura).
 *
 * `React.cache` memoiza POR REQUEST no render RSC: os dois layouts da mesma
 * navegação compartilham a mesma resolução. Requests diferentes não
 * compartilham nada (não é cache entre usuários — é dedup intra-request).
 *
 * O middleware fica de fora de propósito: o `getUser()` dele roda em outro
 * runtime e é quem REFRESCA o cookie da sessão — não pode ser deduplicado.
 *
 * Guard: `serverAuthCache.test.ts`.
 */
import { cache } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { resolveRoleByUser, type IrontracksRole } from '@/utils/auth/route'

/** Usuário da sessão, validado UMA vez por request (compartilhado entre layouts). */
export const getRequestUser = cache(async (): Promise<User | null> => {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user?.id) return null
    return data.user
})

/** Role resolvida UMA vez por request para o mesmo userId. */
export const getRequestRole = cache(
    async (userId: string, email: string | null): Promise<{ role: IrontracksRole }> =>
        resolveRoleByUser({ id: userId, email }),
)

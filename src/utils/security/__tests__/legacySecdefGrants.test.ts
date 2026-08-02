/**
 * Guard da varredura de funções SECURITY DEFINER (ago/2026).
 *
 * ACHADO CONFIRMADO em produção: com `set role anon`, um visitante NÃO
 * autenticado leu a contagem real de alunos de um professor (10) e o limite
 * do plano dele. As funções não tinham guarda interna e aceitavam uuid
 * arbitrário — oráculo de enumeração para quem tivesse um user_id (que
 * circula em perfis públicos e na comunidade).
 *
 * O guard trava as duas metades da decisão, porque errar para qualquer lado é
 * caro: revogar demais derruba feature em produção, revogar de menos deixa o
 * vazamento aberto.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const sql = readFileSync(
    path.resolve(__dirname, '../../../../supabase/migrations/20260802220000_lock_down_legacy_secdef_grants.sql'),
    'utf8',
).toLowerCase()

/** Só service-role: todos os call-sites usam createAdminClient(). */
const APENAS_SERVICE = [
    'teacher_student_count',
    'teacher_can_add_student',
    'users_share_private_channel',
    'verify_recovery_code_admin',
    'dedupe_direct_channels',
]

/** App logado usa; anon nunca deveria. */
const APP_LOGADO = [
    'iron_rank_leaderboard',
    'iron_rank_my_total_volume',
    'get_or_create_direct_channel',
    'get_user_conversations',
    'admin_get_vip_stats',
    'auth_role',
    'can_view_story',
    'can_dm_pair',
]

describe('vazamento fechado: funções exclusivas do service-role', () => {
    for (const fn of APENAS_SERVICE) {
        it(`${fn} perde anon E authenticated`, () => {
            const revoke = sql.match(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from ([^;]+);`))
            expect(revoke, `revoke de ${fn} ausente`).toBeTruthy()
            expect(revoke![1]).toContain('anon')
            expect(revoke![1]).toContain('authenticated')
            expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`))
        })
    }
})

describe('app não quebra: funções que o usuário logado usa', () => {
    for (const fn of APP_LOGADO) {
        it(`${fn} perde anon mas mantém authenticated`, () => {
            const revoke = sql.match(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from ([^;]+);`))
            expect(revoke, `revoke de ${fn} ausente`).toBeTruthy()
            expect(revoke![1]).toContain('anon')
            const grant = sql.match(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to ([^;]+);`))
            expect(grant, `grant de ${fn} ausente — revogar sem reconceder derruba a feature`).toBeTruthy()
            expect(grant![1]).toContain('authenticated')
        })
    }
})

describe('intocáveis: revogar derrubaria o app inteiro', () => {
    it('auth_uid não é tocada (185 policies, 20 avaliadas por anon)', () => {
        expect(sql, 'auth_uid sustenta a RLS de quase toda tabela')
            .not.toMatch(/revoke[^;]*auth_uid/)
    })

    it('funções de trigger não são tocadas (PostgREST não expõe; signup depende)', () => {
        // Olha só os COMANDOS — os nomes aparecem de propósito nos comentários,
        // que documentam por que ficaram de fora.
        const comandos = sql
            .split('\n')
            .filter((l) => l.trim().startsWith('revoke') || l.trim().startsWith('grant'))
            .join('\n')
        for (const trigger of ['handle_new_user', 'link_user_and_profile', 'enforce_invite_whitelist']) {
            expect(comandos, `${trigger} é trigger — mexer é risco sem ganho`)
                .not.toContain(trigger)
        }
    })
})

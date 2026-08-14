/**
 * Guard dos grants de RPC nova (ago/2026).
 *
 * Postgres concede EXECUTE a PUBLIC em toda função nova, e no Supabase isso
 * alcança `anon`. As duas RPCs criadas em 02/08 nasceram abertas ao papel
 * anônimo — pego pelo advisor de segurança horas depois. A pior:
 * `rollup_user_activity_monthly` é SECURITY DEFINER e varre a telemetria
 * inteira; aberta a `anon`, virava DoS de CPU em produção.
 *
 * Este guard trava a CLASSE: toda migration que cria função tem que fechar o
 * EXECUTE explicitamente. É source-guard porque o default perigoso é do
 * Postgres, não do nosso código — não existe teste de comportamento que o
 * revele.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations')

/** Migrations desta sessão que criam função e precisam do lockdown. */
const LOCKDOWN_SQL = readFileSync(
    path.join(MIGRATIONS_DIR, '20260802200000_lock_down_new_rpc_grants.sql'),
    'utf8',
).toLowerCase()

describe('lockdown das RPCs de 02/08', () => {
    it('rollup (SECURITY DEFINER) é exclusivo do service_role', () => {
        expect(LOCKDOWN_SQL).toContain('revoke all on function public.rollup_user_activity_monthly(date, date) from public')
        expect(LOCKDOWN_SQL).toContain('revoke all on function public.rollup_user_activity_monthly(date, date) from anon')
        expect(LOCKDOWN_SQL).toContain('revoke all on function public.rollup_user_activity_monthly(date, date) from authenticated')
        expect(LOCKDOWN_SQL).toContain('grant execute on function public.rollup_user_activity_monthly(date, date) to service_role')
    })

    it('patch de sessão perde anon mas mantém authenticated (é o app treinando)', () => {
        expect(LOCKDOWN_SQL).toContain('from anon')
        expect(LOCKDOWN_SQL).toMatch(/grant execute on function public\.patch_active_session_logs[^;]*to authenticated/)
    })
})

describe('classe: função nova em migration precisa fechar EXECUTE', () => {
    // Migrations desta leva (02/08/2026). Novas entram aqui conforme surgem —
    // a lista é o registro de quem já foi auditado.
    const AUDITADAS = [
        '20260802120000_patch_active_session_logs_rpc.sql',
        '20260802180000_telemetry_monthly_rollup.sql',
        '20260814095031_harden_increment_counter_v2.sql',
    ]

    it('as migrations que criam função têm lockdown correspondente', () => {
        for (const arquivo of AUDITADAS) {
            const sql = readFileSync(path.join(MIGRATIONS_DIR, arquivo), 'utf8').toLowerCase()
            const criadas = [...sql.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1])
            expect(criadas.length, `${arquivo} deveria criar função`).toBeGreaterThan(0)
            for (const fn of criadas) {
                // O revoke pode morar no lockdown compartilhado (leva de 02/08)
                // ou na PRÓPRIA migration (autocontida, padrão desde 14/08) —
                // o que não pode é não existir em lugar nenhum.
                const autocontida = sql.includes(`revoke all on function public.${fn}`)
                expect(
                    LOCKDOWN_SQL.includes(fn) || autocontida,
                    `${fn} criada em ${arquivo} sem revoke de anon (nem no lockdown compartilhado, nem na própria migration)`
                ).toBe(true)
            }
        }
    })

    it('nenhuma migration nova de 02/08 escapou da lista auditada', () => {
        const doDia = readdirSync(MIGRATIONS_DIR)
            .filter((f) => f.startsWith('202608') && f.endsWith('.sql'))
            .filter((f) => {
                const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8').toLowerCase()
                return /create or replace function public\./.test(sql)
            })
            .filter((f) => !f.includes('lock_down_new_rpc_grants'))
        expect(doDia.sort()).toEqual(AUDITADAS.sort())
    })
})

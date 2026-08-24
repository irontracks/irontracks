/**
 * Guard da retenção de telemetria (ago/2026).
 *
 * `user_activity_events` era metade do banco e crescia sem teto. A purga só é
 * segura porque a tendência mensal fica preservada em `user_activity_monthly`.
 *
 * O INVARIANTE que não pode quebrar nunca: **agrega antes de apagar, e se o
 * rollup falhar a purga não roda**. Dado bruto apagado sem agregado é perda
 * permanente de histórico — o tipo de bug que ninguém percebe até precisar do
 * número, meses depois.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const rota = readFileSync(path.resolve(__dirname, '../telemetry-retention/route.ts'), 'utf8')
const migration = readFileSync(
    path.resolve(__dirname, '../../../../../supabase/migrations/20260802180000_telemetry_monthly_rollup.sql'),
    'utf8',
)
const vercelJson = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../../../vercel.json'), 'utf8'),
) as { crons?: Array<{ path: string; schedule: string }> }

describe('ordem: agrega antes de apagar', () => {
    it('o rollup acontece antes do delete', () => {
        const idxRollup = rota.indexOf("rpc('rollup_user_activity_monthly'")
        const idxDelete = rota.indexOf(".delete()")
        expect(idxRollup).toBeGreaterThan(-1)
        expect(idxDelete).toBeGreaterThan(-1)
        expect(idxRollup, 'purga antes do rollup = histórico perdido').toBeLessThan(idxDelete)
    })

    it('rollup que falha aborta a execução (não cai no delete)', () => {
        const trecho = rota.slice(rota.indexOf('if (rollupErr)'), rota.indexOf('// ── 2.'))
        expect(trecho).toContain('return NextResponse.json')
        expect(trecho).toContain('rollup_failed')
    })

    it('purga é incremental (teto por execução, sem lock longo)', () => {
        expect(rota).toMatch(/MAX_DELETE_PER_RUN = [\d_]+/)
        // Este caso cobrava `.limit(MAX_DELETE_PER_RUN)` — e era justamente a
        // construção QUEBRADA: o PostgREST devolve no máximo 1000 linhas, então
        // o "teto de 20.000" nunca chegava ao select, e o `.in()` com a página
        // inteira estourava a URL (medido em 24/08/2026: 300 ids ok, 500 falha).
        // A purga ficou morta de 04/08 a 24/08 com este guard verde. O
        // invariante REAL é "existe teto por execução e ele é respeitado" —
        // hoje pelo laço, não por um `.limit()` que o servidor ignora.
        expect(rota).toMatch(/while\s*\(\s*purged\s*<\s*MAX_DELETE_PER_RUN\s*\)/)
        expect(rota).toContain('.limit(pageSize)')
    })
})

describe('proteções da rota', () => {
    it('exige autorização de cron', () => {
        expect(rota).toContain('isCronAuthorized(req)')
        const idxAuth = rota.indexOf('isCronAuthorized(req)')
        const idxAdmin = rota.indexOf('createAdminClient()')
        expect(idxAuth, 'o gate tem que vir antes do client de service-role').toBeLessThan(idxAdmin)
    })

    it('grava trilha em audit_events (log expira, banco não)', () => {
        expect(rota).toContain("action: 'cron_telemetry_retention'")
        expect(rota).toContain('purged')
    })
})

describe('agregado preserva a tendência', () => {
    it('guarda contagem E usuários distintos por mês/evento', () => {
        expect(migration).toContain('unique_users')
        expect(migration).toContain('count(distinct e.user_id)')
        expect(migration).toMatch(/date_trunc\('month', e\.created_at\)/)
    })

    it('rollup é idempotente (on conflict do update)', () => {
        expect(migration).toContain('on conflict (month, event_name, event_type) do update')
    })

    it('agregado é read-only pro client (só admin lê; escrita é service-role)', () => {
        expect(migration).toContain('enable row level security')
        expect(migration).toMatch(/for select to authenticated[\s\S]{0,80}is_admin/)
        expect(migration, 'nenhuma policy de escrita para o client')
            .not.toMatch(/for (insert|update|delete) to authenticated/)
    })
})

describe('cron registrado', () => {
    it('está no vercel.json com agendamento diário', () => {
        const cron = (vercelJson.crons || []).find((c) => c.path === '/api/cron/telemetry-retention')
        expect(cron, 'sem entrada no vercel.json o cron nunca roda').toBeTruthy()
        expect(cron?.schedule).toMatch(/^\d+ \d+ \* \* \*$/)
    })
})

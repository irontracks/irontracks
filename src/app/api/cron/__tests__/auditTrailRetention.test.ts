/**
 * Guard da retenção da trilha de séries (`sets_audit`) — ago/2026.
 *
 * Achado da auditoria de 07/08: o gatilho gravava toda alteração em `sets`,
 * mas NADA lia a tabela (5.002 linhas, `idx_scan = 1` desde que existe). Ela
 * só engordava.
 *
 * Poda de trilha forense pede dois cuidados que estes testes travam:
 *   1. prazo MAIOR que o da telemetria — uma denúncia de alteração indevida
 *      chega semanas depois do fato, e 90 dias é curto para investigar;
 *   2. registrar QUE apagou. Apagar trilha sem deixar rastro do expurgo é o
 *      pior cenário possível numa investigação futura.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const rota = readFileSync(path.resolve(__dirname, '../audit-trail-retention/route.ts'), 'utf8')
const telemetria = readFileSync(path.resolve(__dirname, '../telemetry-retention/route.ts'), 'utf8')
const vercelJson = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../../../vercel.json'), 'utf8'),
) as { crons?: Array<{ path: string; schedule: string }> }

const numeroDe = (src: string, nome: string): number => {
    const m = src.match(new RegExp(`${nome}\\s*=\\s*([\\d_]+)`))
    return m ? Number(m[1].replace(/_/g, '')) : NaN
}

describe('prazo de retenção', () => {
    it('a trilha vive mais que a telemetria', () => {
        const trilha = numeroDe(rota, 'AUDIT_RETENTION_DAYS')
        const telem = numeroDe(telemetria, 'RETENTION_DAYS')
        expect(Number.isFinite(trilha)).toBe(true)
        expect(Number.isFinite(telem)).toBe(true)
        expect(trilha, 'trilha forense apagada antes da telemetria não faz sentido').toBeGreaterThan(telem)
    })

    it('a janela cobre pelo menos um semestre', () => {
        expect(numeroDe(rota, 'AUDIT_RETENTION_DAYS')).toBeGreaterThanOrEqual(180)
    })
})

describe('proteções da rota', () => {
    it('exige autorização de cron ANTES do client de service-role', () => {
        const idxAuth = rota.indexOf('isCronAuthorized(req)')
        const idxAdmin = rota.indexOf('createAdminClient()')
        expect(idxAuth).toBeGreaterThan(-1)
        expect(idxAuth).toBeLessThan(idxAdmin)
    })

    it('purga incremental, com teto por execução', () => {
        expect(rota).toMatch(/MAX_DELETE_PER_RUN = [\d_]+/)
        expect(rota).toContain('.limit(MAX_DELETE_PER_RUN)')
    })

    it('apaga só o que passou do corte — nunca a tabela toda', () => {
        expect(rota).toContain(".lt('at', cutoffIso)")
        const del = rota.slice(rota.indexOf(".from('sets_audit')\n      .delete()"))
        expect(rota).toMatch(/\.delete\(\)\s*\.in\('id', ids\)/)
        expect(del).not.toContain('.neq(')
    })

    it('registra o expurgo em audit_events', () => {
        expect(rota).toContain("action: 'cron_audit_trail_retention'")
        expect(rota).toContain('purged')
    })

    it('erro de select não vira delete às cegas', () => {
        const trecho = rota.slice(rota.indexOf('if (selErr)'), rota.indexOf('const ids ='))
        expect(trecho).toContain('return NextResponse.json')
        expect(trecho).toContain('select_failed')
    })
})

describe('agendamento', () => {
    it('está registrado no vercel.json', () => {
        const cron = (vercelJson.crons || []).find((c) => c.path === '/api/cron/audit-trail-retention')
        expect(cron, 'cron sem entrada no vercel.json nunca roda').toBeTruthy()
        expect(cron?.schedule).toMatch(/^\S+ \S+ \S+ \S+ \S+$/)
    })

    it('não colide com o horário da retenção de telemetria', () => {
        const crons = vercelJson.crons || []
        const a = crons.find((c) => c.path === '/api/cron/audit-trail-retention')?.schedule
        const b = crons.find((c) => c.path === '/api/cron/telemetry-retention')?.schedule
        expect(a).not.toBe(b)
    })
})

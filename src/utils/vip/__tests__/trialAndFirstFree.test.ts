import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TRIAL_PLAN_ID, TRIAL_DAYS, TRIAL_PROVIDER } from '../trial'

/**
 * Fase 1 da tração (02/08/2026): trial de 14 dias do Pro + primeiro exame
 * grátis. Contexto medido: pagantes orgânicos ZERO, e o único usuário com
 * acesso pleno usa intensamente — ninguém compra o que nunca provou.
 */
const TRIAL = readFileSync('src/utils/vip/trial.ts', 'utf8')
const ACCESS = readFileSync('src/utils/vip/labExamsAccess.ts', 'utf8')
const BOOTSTRAP = readFileSync('src/app/api/dashboard/bootstrap/route.ts', 'utf8')

describe('trial de 14 dias do Pro', () => {
    it('parâmetros do trial', () => {
        expect(TRIAL_PLAN_ID).toBe('vip_pro')
        expect(TRIAL_DAYS).toBe(14)
        expect(TRIAL_PROVIDER).toBe('trial')
    })

    it('QUALQUER entitlement pré-existente desqualifica — senão vira loop de trial', () => {
        // Sem filtro de status de propósito: expirado/revogado também conta.
        const trecho = TRIAL.slice(TRIAL.indexOf('QUALQUER linha desqualifica'))
        expect(trecho).toMatch(/\.eq\('user_id', uid\)\.limit\(1\)/)
        expect(trecho).not.toMatch(/\.eq\('status'/)
    })

    it('admin/teacher ficam de fora — já são Elite por role', () => {
        expect(TRIAL).toMatch(/role === 'admin' \|\| role === 'teacher'\) return false/)
    })

    it('escreve via service-role, como toda escrita de entitlement', () => {
        // Regra de segurança de jul/2026: o client autenticado só tem SELECT.
        expect(TRIAL).toMatch(/createAdminClient\(\)/)
    })

    it('expira sozinho por valid_until — sem cron novo', () => {
        expect(TRIAL).toMatch(/valid_until: until\.toISOString\(\)/)
    })

    it('deixa trilha em audit_events', () => {
        expect(TRIAL).toMatch(/action: 'vip_trial_granted'/)
    })

    it('o bootstrap dispara FORA do caminho quente, com waitUntil', () => {
        // Sem waitUntil seria a promessa órfã que já atrasou push em 13 min.
        expect(BOOTSTRAP).toMatch(/waitUntil\(maybeGrantTrial\(user\.id\)/)
    })
})

describe('primeiro exame de sangue grátis', () => {
    it('create: grátis só com ZERO exames; processamento aceita o exame que entrou', () => {
        expect(ACCESS).toMatch(/stage === 'create' \? 0 : 1/)
    })

    it('falha na contagem NEGA — falhar aberto daria Gemini ilimitado de graça', () => {
        const trecho = ACCESS.slice(ACCESS.indexOf('catch (e)'))
        expect(trecho).toMatch(/reason: 'denied'/)
        expect(ACCESS).not.toMatch(/catch[^}]*first_free/)
    })

    it('as TRÊS rotas do fluxo usam o helper — gate parcial deixaria o free travado no meio', () => {
        for (const [rota, stage] of [
            ['src/app/api/lab-exams/create/route.ts', "'create'"],
            ['src/app/api/ai/lab-exam-extract/route.ts', "'process'"],
            ['src/app/api/ai/lab-exam-protocol/route.ts', "'process'"],
        ] as const) {
            const src = readFileSync(rota, 'utf8')
            expect(src, rota).toMatch(new RegExp(`checkLabExamsAccess\\([^)]*${stage}\\)`))
            expect(src, rota).not.toMatch(/checkVipFeatureAccess\([^)]*'lab_exams'/)
        }
    })

    it('o metering VIP continua só para VIP — o exame-demonstração não debita cota', () => {
        // O caminho first_free retorna ANTES de qualquer increment.
        const vipFirst = ACCESS.indexOf("checkVipFeatureAccess(supabase, userId, 'lab_exams', { meter: true })")
        const freeCheck = ACCESS.indexOf("from('lab_exams')")
        expect(vipFirst).toBeGreaterThan(0)
        expect(freeCheck).toBeGreaterThan(vipFirst)
    })
})

describe('o e-mail de aprovação anuncia o trial', () => {
    it('a pessoa fica sabendo no momento de maior atenção', () => {
        const EMAIL = readFileSync('src/utils/email/approvalEmail.ts', 'utf8')
        expect(EMAIL).toMatch(/14 dias de VIP Pro/)
        // nas DUAS versões (html e texto)
        expect(EMAIL).toMatch(/escapeHtml\(trialLine\)/)
        expect(EMAIL).toMatch(/\n        trialLine,/)
    })
})

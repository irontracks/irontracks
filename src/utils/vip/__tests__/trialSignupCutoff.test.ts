/**
 * Guard da DATA DE CORTE do trial (16/08/2026).
 *
 * Diferente do `trialAndFirstFree.test.ts`, que é source-guard, aqui a função
 * roda de verdade contra um Supabase mockado — porque o que precisa ser provado
 * é COMPORTAMENTO, e source-guard não distingue "a linha existe" de "a linha
 * decide".
 *
 * O que está em jogo: o CHECK de `user_entitlements.provider` nunca aceitou
 * `'trial'`, então de 02/08 a 16/08 nenhuma concessão entrou. Ao corrigir o
 * CHECK, `maybeGrantTrial` passaria a conceder a todo mundo que "nunca teve
 * entitlement" — 48 contas medidas, a maioria veterana. Estes casos travam
 * isso: quem se cadastrou ANTES do corte não ganha trial automático.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
    profile: null as { role?: string; created_at?: string } | null,
    entitlements: [] as unknown[],
    inserts: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/utils/supabase/admin', () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            if (table === 'profiles') {
                return {
                    select: () => ({
                        eq: () => ({ maybeSingle: async () => ({ data: h.profile, error: null }) }),
                    }),
                }
            }
            if (table === 'user_entitlements') {
                return {
                    select: () => ({ eq: () => ({ limit: async () => ({ data: h.entitlements, error: null }) }) }),
                    insert: async (row: Record<string, unknown>) => { h.inserts.push(row); return { error: null } },
                }
            }
            if (table === 'audit_events') {
                return { insert: async (row: Record<string, unknown>) => { h.audits.push(row); return { error: null } } }
            }
            throw new Error(`tabela inesperada: ${table}`)
        },
    }),
}))

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }))

import { maybeGrantTrial, TRIAL_SIGNUP_CUTOFF, TRIAL_PROVIDER, TRIAL_DAYS } from '../trial'

const UID = '11111111-2222-3333-4444-555555555555'
const ANTES = '2026-06-24T23:01:57.000Z'   // veterano real da base
const DEPOIS = '2026-08-16T10:00:00.000Z'  // cadastro após o corte

beforeEach(() => {
    h.profile = null
    h.entitlements = []
    h.inserts = []
    h.audits = []
})

describe('maybeGrantTrial — data de corte', () => {
    it('cadastro ANTERIOR ao corte não ganha trial automático', async () => {
        h.profile = { role: 'student', created_at: ANTES }
        await expect(maybeGrantTrial(UID)).resolves.toBe(false)
        expect(h.inserts).toEqual([])
    })

    it('cadastro POSTERIOR ao corte ganha, com provider e prazo certos', async () => {
        h.profile = { role: 'student', created_at: DEPOIS }
        await expect(maybeGrantTrial(UID)).resolves.toBe(true)
        expect(h.inserts).toHaveLength(1)
        expect(h.inserts[0].provider).toBe(TRIAL_PROVIDER)
        expect(h.inserts[0].user_id).toBe(UID)

        const de = Date.parse(String(h.inserts[0].valid_from))
        const ate = Date.parse(String(h.inserts[0].valid_until))
        expect(Math.round((ate - de) / 86_400_000)).toBe(TRIAL_DAYS)
    })

    it('exatamente no instante do corte já vale — o corte é inclusivo', async () => {
        h.profile = { role: 'student', created_at: TRIAL_SIGNUP_CUTOFF }
        await expect(maybeGrantTrial(UID)).resolves.toBe(true)
    })

    it('sem carimbo de cadastro NÃO concede — na dúvida, não abre acesso pago', async () => {
        h.profile = { role: 'student' }
        await expect(maybeGrantTrial(UID)).resolves.toBe(false)
        expect(h.inserts).toEqual([])
    })

    it('perfil inexistente não concede', async () => {
        h.profile = null
        await expect(maybeGrantTrial(UID)).resolves.toBe(false)
        expect(h.inserts).toEqual([])
    })

    it('admin e teacher continuam fora, mesmo cadastrando depois do corte', async () => {
        for (const role of ['admin', 'teacher']) {
            h.inserts = []
            h.profile = { role, created_at: DEPOIS }
            await expect(maybeGrantTrial(UID)).resolves.toBe(false)
            expect(h.inserts).toEqual([])
        }
    })

    it('entitlement pré-existente continua desqualificando', async () => {
        h.profile = { role: 'student', created_at: DEPOIS }
        h.entitlements = [{ id: 'algum' }]
        await expect(maybeGrantTrial(UID)).resolves.toBe(false)
        expect(h.inserts).toEqual([])
    })

    it('concede deixa trilha em audit_events', async () => {
        h.profile = { role: 'student', created_at: DEPOIS }
        await maybeGrantTrial(UID)
        expect(h.audits).toHaveLength(1)
        expect(h.audits[0].action).toBe('vip_trial_granted')
        expect(h.audits[0].entity_id).toBe(UID)
    })

    it('id vazio nem consulta o banco', async () => {
        await expect(maybeGrantTrial('   ')).resolves.toBe(false)
        expect(h.inserts).toEqual([])
    })
})

/**
 * Guards do funil de conversão.
 *
 * O que está sob teste aqui não é aritmética: é a diferença entre um número
 * honesto e um número que engana quem lê. `payingActive` vira manchete de
 * story — se ele contar cortesia do painel ou a conta vitalícia do Apple App
 * Review, o app publica "assinantes" que nunca pagaram.
 *
 * As fixtures são as linhas REAIS de `user_entitlements` em produção
 * (conferidas em 16/08/2026), com os e-mails trocados por rótulos.
 */
import { describe, it, expect } from 'vitest'
import {
    buildFunnelMetrics,
    countPayingActive,
    distinctUsers,
    pctLabel,
    PAYING_PROVIDERS,
} from '../funnelMetrics'

const NOW = Date.parse('2026-08-16T12:00:00Z')

/** As 4 linhas ativas de produção em 16/08/2026. */
const ENTITLEMENTS_REAIS = [
    // cortesia de admin (conta de teste do painel)
    { user_id: 'admin-test', provider: 'admin', status: 'active', valid_until: '2027-05-01T18:19:02Z', metadata: {} },
    // compra Apple vigente
    { user_id: 'comprador', provider: 'apple', status: 'active', valid_until: '2027-05-15T23:59:59Z', metadata: { event_type: 'INITIAL_PURCHASE' } },
    // cortesia concedida pelo painel
    { user_id: 'cortesia', provider: 'admin', status: 'active', valid_until: '2027-06-12T08:46:04Z', metadata: { days: 365, source: 'admin_panel' } },
    // conta do Apple App Review — vitalícia por concessão manual
    { user_id: 'apple-review', provider: 'apple', status: 'active', valid_until: null, metadata: { lifetime_grant: true } },
]

describe('countPayingActive', () => {
    it('conta só quem pagou: das 4 linhas ativas de produção, 1', () => {
        expect(countPayingActive(ENTITLEMENTS_REAIS, NOW)).toBe(1)
    })

    it('descarta cortesia do painel (provider admin/manual)', () => {
        const so_cortesia = ENTITLEMENTS_REAIS.filter((e) => e.provider === 'admin')
        expect(so_cortesia).toHaveLength(2)
        expect(countPayingActive(so_cortesia, NOW)).toBe(0)
    })

    it('descarta o vitalício concedido à mão (lifetime_grant)', () => {
        const review = ENTITLEMENTS_REAIS.filter((e) => e.metadata?.lifetime_grant === true)
        expect(review).toHaveLength(1)
        expect(countPayingActive(review, NOW)).toBe(0)
    })

    it('aceita vitalício LEGÍTIMO — valid_until nulo sem lifetime_grant', () => {
        expect(countPayingActive([{ provider: 'apple', status: 'active', valid_until: null, metadata: {} }], NOW)).toBe(1)
    })

    it('descarta validade vencida', () => {
        const vencido = [{ provider: 'apple', status: 'active', valid_until: '2026-08-01T00:00:00Z', metadata: {} }]
        expect(countPayingActive(vencido, NOW)).toBe(0)
    })

    it('descarta status não-ativo', () => {
        const revogado = [{ provider: 'apple', status: 'revoked', valid_until: '2027-01-01T00:00:00Z', metadata: {} }]
        expect(countPayingActive(revogado, NOW)).toBe(0)
    })

    it('aguenta lixo sem quebrar', () => {
        expect(countPayingActive(null, NOW)).toBe(0)
        expect(countPayingActive([null, 'x', 42], NOW)).toBe(0)
    })

    it('trial NÃO é provedor de pagamento', () => {
        expect((PAYING_PROVIDERS as readonly string[]).includes('trial')).toBe(false)
        expect(countPayingActive([{ provider: 'trial', status: 'active', valid_until: '2027-01-01T00:00:00Z', metadata: {} }], NOW)).toBe(0)
    })
})

describe('distinctUsers', () => {
    it('conta PESSOAS, não eventos', () => {
        const eventos = [
            { user_id: 'a' }, { user_id: 'a' }, { user_id: 'a' },
            { user_id: 'b' }, { user_id: 'b' },
        ]
        expect(eventos).toHaveLength(5)
        expect(distinctUsers(eventos)).toBe(2)
    })

    it('ignora user_id vazio e linha inválida', () => {
        expect(distinctUsers([{ user_id: '' }, { user_id: '  ' }, null, { outro: 'x' }])).toBe(0)
    })
})

describe('pctLabel', () => {
    it('omite quando não há base — nunca imprime "0% de 0"', () => {
        expect(pctLabel(0, 0)).toBeUndefined()
    })
    it('formata sobre a base', () => {
        expect(pctLabel(3, 5)).toBe('60% de 5')
    })
})

describe('buildFunnelMetrics', () => {
    // O caso real de 02–16/08/2026: o wizard reabre a cada visita de quem não
    // tem treino — 15 aberturas para 5 pessoas.
    const events = [
        ...Array.from({ length: 4 }, () => ({ user_id: 'p1', event_name: 'wizard_auto_open' })),
        ...Array.from({ length: 4 }, () => ({ user_id: 'p2', event_name: 'wizard_auto_open' })),
        { user_id: 'p3', event_name: 'wizard_open' },
        { user_id: 'p4', event_name: 'open_screen' },
    ]

    const base = {
        events,
        signups: 2,
        sessions: [{ user_id: 'p4' }, { user_id: 'p4' }],
        templates: [],
        trials: [],
        entitlements: ENTITLEMENTS_REAIS,
        nowMs: NOW,
    }

    const byKey = (list: ReturnType<typeof buildFunnelMetrics>, k: string) =>
        list.find((m) => m.key === k)!

    it('conta pessoas no wizard, não aberturas', () => {
        const m = byKey(buildFunnelMetrics(base), 'wizardOpened')
        // 9 eventos de wizard no total, 3 pessoas distintas
        expect(events.filter((e) => e.event_name.startsWith('wizard')).length).toBe(9)
        expect(m.value).toBe(3)
    })

    it('zero treino criado com wizard aberto rende 0% — a etapa que quebrou', () => {
        const m = byKey(buildFunnelMetrics(base), 'workoutsCreated')
        expect(m.value).toBe(0)
        expect(m.sub).toBe('0% de 3')
    })

    it('propaga o filtro de assinante pago', () => {
        expect(byKey(buildFunnelMetrics(base), 'payingActive').value).toBe(1)
    })

    it('não inventa taxa quando a etapa anterior é zero', () => {
        const semPaywall = byKey(buildFunnelMetrics(base), 'paywallCta')
        expect(semPaywall.value).toBe(0)
        expect(semPaywall.sub).toBeUndefined()
    })

    it('toda métrica tem chave e rótulo — o story lê os dois', () => {
        for (const m of buildFunnelMetrics(base)) {
            expect(m.key).toBeTruthy()
            expect(m.label).toBeTruthy()
            expect(Number.isFinite(m.value)).toBe(true)
        }
    })
})

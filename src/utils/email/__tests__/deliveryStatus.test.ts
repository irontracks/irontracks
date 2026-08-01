import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveDeliveryStatus, type AuditRow } from '@/utils/email/deliveryStatus'

/**
 * O caso real (23/07): o e-mail de aprovação de uma aluna foi ACEITO pela
 * Resend — HTTP 200 — e nunca chegou, porque a caixa dela estava cheia. O
 * bounce veio depois, assíncrono, e não havia nada escutando.
 *
 * `resolveDeliveryStatus` é onde as duas metades se encontram.
 */
const ev = (action: string, at: string, metadata: Record<string, unknown> = {}): AuditRow =>
    ({ action, entity_id: 'req-1', created_at: at, metadata })

const PROVIDER = '45d82705-d7c0-4314-9564-23b6ab1cd6ea'

describe('resolveDeliveryStatus', () => {
    it('aceito pela Resend, sem veredito ainda → enviado (não "entregue")', () => {
        const r = resolveDeliveryStatus(
            [ev('approval_email_sent', '2026-07-23T01:06:00Z', { provider_id: PROVIDER })],
            new Map(),
        )
        expect(r.state).toBe('sent')
        expect(r.needsAttention).toBe(false)
    })

    it('o BOUNCE vence o "enviado" — é o caso que originou tudo isto', () => {
        const r = resolveDeliveryStatus(
            [ev('approval_email_sent', '2026-07-23T01:06:00Z', { provider_id: PROVIDER })],
            new Map([[PROVIDER, [ev('email_delivery_bounced', '2026-07-23T01:06:30Z')]]]),
        )
        expect(r.state).toBe('bounced')
        expect(r.label).toBe('Não chegou')
        expect(r.needsAttention).toBe(true)
    })

    it('entregue de verdade é o único "tudo certo"', () => {
        const r = resolveDeliveryStatus(
            [ev('approval_email_sent', '2026-08-01T16:57:00Z', { provider_id: PROVIDER })],
            new Map([[PROVIDER, [ev('email_delivery_delivered', '2026-08-01T16:57:20Z')]]]),
        )
        expect(r.state).toBe('delivered')
        expect(r.needsAttention).toBe(false)
    })

    it('um "delivered" anterior NÃO apaga o spam que veio depois', () => {
        // Gravidade manda, não ordem de chegada.
        const r = resolveDeliveryStatus(
            [ev('approval_email_sent', '2026-08-01T10:00:00Z', { provider_id: PROVIDER })],
            new Map([[PROVIDER, [
                ev('email_delivery_delivered', '2026-08-01T10:00:10Z'),
                ev('email_delivery_complained', '2026-08-01T12:00:00Z'),
            ]]]),
        )
        expect(r.state).toBe('complained')
        expect(r.needsAttention).toBe(true)
    })

    it('falha no próprio envio aparece sem depender de webhook', () => {
        const r = resolveDeliveryStatus(
            [ev('approval_email_failed', '2026-08-01T10:00:00Z', { reason: 'provider_error' })],
            new Map(),
        )
        expect(r.state).toBe('send_failed')
        expect(r.needsAttention).toBe(true)
    })

    it('reenvio entregue supera a primeira tentativa que falhou', () => {
        // O admin reenviou e chegou: o card não pode continuar vermelho.
        const r = resolveDeliveryStatus(
            [
                ev('approval_email_sent', '2026-07-23T01:06:00Z', { provider_id: PROVIDER }),
                ev('approval_email_sent', '2026-08-01T18:00:00Z', { provider_id: 'novo-id', resent: true }),
            ],
            new Map([
                [PROVIDER, [ev('email_delivery_delivered', '2026-07-23T01:06:30Z')]],
                ['novo-id', [ev('email_delivery_delivered', '2026-08-01T18:00:30Z')]],
            ]),
        )
        expect(r.state).toBe('delivered')
    })

    it('aprovação antiga, sem registro, não mente dizendo que chegou', () => {
        const r = resolveDeliveryStatus([], new Map())
        expect(r.state).toBe('unknown')
        expect(r.label).toBe('Sem registro')
        expect(r.needsAttention).toBe(false)
    })

    it('evento desconhecido é ignorado em vez de virar estado inventado', () => {
        const r = resolveDeliveryStatus(
            [ev('approval_email_sent', '2026-08-01T10:00:00Z', { provider_id: PROVIDER })],
            new Map([[PROVIDER, [ev('email_delivery_teleported', '2026-08-01T11:00:00Z')]]]),
        )
        expect(r.state).toBe('sent')
    })
})

describe('rota do webhook', () => {
    const src = readFileSync('src/app/api/webhooks/resend/route.ts', 'utf8')

    it('verifica assinatura antes de escrever no banco', () => {
        // Endpoint público que grava: sem isto, qualquer um forja um bounce.
        const verifyAt = src.indexOf('verifySvixSignature(')
        const insertAt = src.indexOf(".from('audit_events').insert")
        expect(verifyAt).toBeGreaterThan(0)
        expect(insertAt).toBeGreaterThan(verifyAt)
    })

    it('usa o corpo CRU — parse+stringify quebra a assinatura', () => {
        expect(src).toMatch(/const rawBody = await req\.text\(\)/)
        expect(src).toMatch(/verifySvixSignature\(\s*\n?\s*rawBody/)
    })

    it('deduplica por svix-id — a Resend reenvia em timeout', () => {
        expect(src).toContain("'metadata->>svix_id'")
        expect(src).toMatch(/duplicate: true/)
    })

    it('responde 2xx a evento não acompanhado, para a Resend não reenviar eternamente', () => {
        expect(src).toMatch(/if \(!action\) return NextResponse\.json\(\{ ok: true/)
    })

    it('responde 5xx quando o banco falha, para a Resend TENTAR de novo', () => {
        // O oposto do caso acima: aqui o evento não pode evaporar.
        expect(src).toMatch(/persist_failed'[\s\S]{0,40}status: 500/)
    })

    it('não acompanha abertura nem clique', () => {
        // Rastreamento de comportamento não é entregabilidade — e ninguém pediu.
        expect(src).not.toContain('email.opened')
        expect(src).not.toContain('email.clicked')
    })
})

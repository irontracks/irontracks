import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifySvixSignature, TOLERANCE_SECONDS } from '@/utils/email/verifySvixSignature'

/**
 * O webhook da Resend é um endpoint PÚBLICO que escreve no banco. Sem
 * assinatura, qualquer um posta `email.bounced` e suja o histórico de entrega —
 * ou esconde um bounce real no meio de ruído.
 */
const SECRET_RAW = Buffer.from('segredo-de-teste-com-32-bytes!!!').toString('base64')
const SECRET = `whsec_${SECRET_RAW}`
const ID = 'msg_2abc'
const BODY = '{"type":"email.bounced","data":{"email_id":"45d82705-d7c0-4314-9564-23b6ab1cd6ea"}}'
const NOW = 1_754_000_000_000
const TS = String(Math.floor(NOW / 1000))

function sign(body: string, id = ID, ts = TS, secretB64 = SECRET_RAW): string {
    const mac = createHmac('sha256', Buffer.from(secretB64, 'base64'))
        .update(`${id}.${ts}.${body}`).digest('base64')
    return `v1,${mac}`
}

const headers = (over: Partial<{ id: string; timestamp: string; signature: string }> = {}) => ({
    id: ID, timestamp: TS, signature: sign(BODY), ...over,
})

describe('verifySvixSignature', () => {
    it('aceita assinatura válida', () => {
        expect(verifySvixSignature(BODY, headers(), SECRET, NOW)).toEqual({ ok: true })
    })

    it('aceita o segredo sem o prefixo whsec_', () => {
        expect(verifySvixSignature(BODY, headers(), SECRET_RAW, NOW).ok).toBe(true)
    })

    it('recusa corpo adulterado — é o ataque que importa', () => {
        const forjado = BODY.replace('bounced', 'delivered')
        const r = verifySvixSignature(forjado, headers(), SECRET, NOW)
        expect(r).toEqual({ ok: false, reason: 'bad_signature' })
    })

    it('recusa assinatura de outro segredo', () => {
        const outro = Buffer.from('outro-segredo-com-32-bytes-aqui!').toString('base64')
        const r = verifySvixSignature(BODY, headers({ signature: sign(BODY, ID, TS, outro) }), SECRET, NOW)
        expect(r).toEqual({ ok: false, reason: 'bad_signature' })
    })

    it('recusa quando o id muda — o id entra no conteúdo assinado', () => {
        const r = verifySvixSignature(BODY, headers({ id: 'msg_outro' }), SECRET, NOW)
        expect(r).toEqual({ ok: false, reason: 'bad_signature' })
    })

    it('recusa timestamp fora da janela — sem isso um POST capturado vale sempre', () => {
        const velho = String(Math.floor(NOW / 1000) - TOLERANCE_SECONDS - 1)
        const r = verifySvixSignature(BODY, headers({ timestamp: velho, signature: sign(BODY, ID, velho) }), SECRET, NOW)
        expect(r).toEqual({ ok: false, reason: 'stale_timestamp' })
        // e também no futuro
        const futuro = String(Math.floor(NOW / 1000) + TOLERANCE_SECONDS + 1)
        expect(verifySvixSignature(BODY, headers({ timestamp: futuro, signature: sign(BODY, ID, futuro) }), SECRET, NOW).ok).toBe(false)
    })

    it('aceita dentro da janela — rotação de segredo e relógio torto são normais', () => {
        const quase = String(Math.floor(NOW / 1000) - TOLERANCE_SECONDS + 10)
        expect(verifySvixSignature(BODY, headers({ timestamp: quase, signature: sign(BODY, ID, quase) }), SECRET, NOW).ok).toBe(true)
    })

    it('aceita quando UMA de várias assinaturas bate (rotação de segredo)', () => {
        const antiga = 'v1,ZmFrZQ=='
        const r = verifySvixSignature(BODY, headers({ signature: `${antiga} ${sign(BODY)}` }), SECRET, NOW)
        expect(r.ok).toBe(true)
    })

    it('ignora versão desconhecida em vez de aceitar', () => {
        const r = verifySvixSignature(BODY, headers({ signature: sign(BODY).replace('v1,', 'v0,') }), SECRET, NOW)
        expect(r).toEqual({ ok: false, reason: 'bad_signature' })
    })

    it('sem segredo configurado NÃO aceita nada', () => {
        // O modo mais fácil de abrir o endpoint por acidente é esquecer a env.
        for (const s of [null, undefined, '', '   ']) {
            expect(verifySvixSignature(BODY, headers(), s).reason).toBe('not_configured')
        }
    })

    it('header faltando é recusa, não erro', () => {
        expect(verifySvixSignature(BODY, headers({ id: '' }), SECRET, NOW).reason).toBe('missing_headers')
        expect(verifySvixSignature(BODY, headers({ timestamp: '' }), SECRET, NOW).reason).toBe('missing_headers')
        expect(verifySvixSignature(BODY, headers({ signature: '' }), SECRET, NOW).reason).toBe('missing_headers')
    })

    it('lixo nos headers não derruba a rota', () => {
        expect(() => verifySvixSignature(BODY, headers({ signature: 'nao-e-assinatura' }), SECRET, NOW)).not.toThrow()
        expect(() => verifySvixSignature(BODY, headers({ timestamp: 'ontem' }), SECRET, NOW)).not.toThrow()
    })
})

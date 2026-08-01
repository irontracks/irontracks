import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * O bug central da auditoria (ago/2026): o envio era
 * `fetch(...).catch(() => null)` e ninguém olhava `res.ok`. Chave ausente,
 * domínio não verificado e rede fora saíam TODOS como sucesso, e a rota
 * respondia "Acesso liberado e e-mail enviado" sem ter enviado nada.
 *
 * Cada caso abaixo é um desses caminhos.
 */

const envMock = { resend: { apiKey: 'test-key', from: 'IronTracks <noreply@irontracks.com.br>' } }
vi.mock('@/utils/env', () => ({ env: envMock }))
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), logWarn: vi.fn(), logWarnRemote: vi.fn() }))

const VALID = { to: 'a@b.com', subject: 'S', html: '<p>h</p>', text: 't' }

let sendTransactionalEmail: typeof import('@/utils/email/sendEmail')['sendTransactionalEmail']

beforeEach(async () => {
    vi.resetModules()
    envMock.resend = { apiKey: 'test-key', from: 'IronTracks <noreply@irontracks.com.br>' }
    ;({ sendTransactionalEmail } = await import('@/utils/email/sendEmail'))
})

afterEach(() => { vi.unstubAllGlobals() })

describe('sendTransactionalEmail', () => {
    it('sucesso devolve o id do provedor — é o rastro pra achar a entrega', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ id: 'ml_123' }),
        }))
        const res = await sendTransactionalEmail(VALID)
        expect(res).toEqual({ ok: true, id: 'ml_123' })
    })

    it('resposta 4xx do provedor NÃO é sucesso', async () => {
        // Domínio não verificado e chave revogada chegam assim. `fetch` resolve,
        // e era exatamente por isso que a falha passava batido.
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false, status: 403, text: async () => '{"message":"domain not verified"}',
        }))
        const res = await sendTransactionalEmail(VALID)
        expect(res.ok).toBe(false)
        if (res.ok) throw new Error('deveria ter falhado')
        expect(res.reason).toBe('provider_error')
        expect(res.detail).toContain('403')
    })

    it('erro de rede vira falha, não silêncio', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
        const res = await sendTransactionalEmail(VALID)
        expect(res.ok).toBe(false)
        if (res.ok) throw new Error('deveria ter falhado')
        expect(res.reason).toBe('network_error')
    })

    it('sem chave configurada devolve not_configured e NÃO chama a rede', async () => {
        // Era o pior caso: `return` mudo. Se a env sumisse em produção, todas as
        // aprovações sairiam sem e-mail e ninguém ficaria sabendo.
        envMock.resend = { apiKey: '', from: '' }
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        const res = await sendTransactionalEmail(VALID)
        expect(res).toEqual({ ok: false, reason: 'not_configured' })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('destinatário inválido nem tenta enviar', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        for (const to of ['', '   ', 'sem-arroba', 'a@b']) {
            const res = await sendTransactionalEmail({ ...VALID, to })
            expect(res).toEqual({ ok: false, reason: 'invalid_recipient' })
        }
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('NUNCA lança — a aprovação já está gravada e não pode ser derrubada', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation(() => { throw new Error('boom') }))
        await expect(sendTransactionalEmail(VALID)).resolves.toMatchObject({ ok: false })
    })

    it('manda text e reply_to junto do html', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'x' }) })
        vi.stubGlobal('fetch', fetchMock)
        await sendTransactionalEmail({ ...VALID, replyTo: 'suporte@x.com' })
        const body = JSON.parse(fetchMock.mock.calls[0][1].body)
        expect(body.text).toBe('t')
        expect(body.reply_to).toBe('suporte@x.com')
        expect(body.to).toEqual(['a@b.com'])
    })

    it('não trava para sempre: a chamada leva timeout', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'x' }) })
        vi.stubGlobal('fetch', fetchMock)
        await sendTransactionalEmail(VALID)
        expect(fetchMock.mock.calls[0][1].signal).toBeDefined()
    })
})

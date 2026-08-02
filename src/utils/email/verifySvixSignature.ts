/**
 * Verificação de assinatura dos webhooks da Resend (padrão Svix).
 *
 * Por que existe: o webhook é um endpoint PÚBLICO que grava no banco. Sem
 * verificar assinatura, qualquer um pode postar `email.bounced` e sujar o
 * histórico de entrega — ou, pior, esconder um bounce real no meio de ruído.
 *
 * Implementado à mão em vez de puxar o SDK do Svix: são 20 linhas de HMAC e o
 * projeto já paga caro por peso de bundle. O algoritmo é o documentado:
 *
 *   assinado   = `${svix-id}.${svix-timestamp}.${corpo cru}`
 *   segredo    = base64_decode(whsec_XXXX  →  a parte depois do prefixo)
 *   assinatura = base64( HMAC-SHA256(assinado, segredo) )
 *   header     = "v1,<assinatura> v1,<outra>"   (rotação manda mais de uma)
 *
 * ⚠️ O corpo tem de ser o TEXTO CRU. `JSON.parse` seguido de `JSON.stringify`
 * reordena chaves e muda espaços — a assinatura deixa de bater.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Janela de tolerância do timestamp. Sem ela, um POST capturado vale para sempre. */
export const TOLERANCE_SECONDS = 5 * 60

export interface SvixHeaders {
    id: string | null
    timestamp: string | null
    signature: string | null
}

export type SvixVerification =
    | { ok: true }
    | { ok: false; reason: 'not_configured' | 'missing_headers' | 'stale_timestamp' | 'bad_signature' }

/**
 * `nowMs` é injetável só para o teste conseguir exercitar a janela de tolerância
 * sem depender do relógio da máquina.
 */
export function verifySvixSignature(
    rawBody: string,
    headers: SvixHeaders,
    secret: string | null | undefined,
    nowMs: number = Date.now(),
): SvixVerification {
    const whsec = String(secret || '').trim()
    if (!whsec) return { ok: false, reason: 'not_configured' }

    const id = String(headers?.id || '').trim()
    const timestamp = String(headers?.timestamp || '').trim()
    const signatureHeader = String(headers?.signature || '').trim()
    if (!id || !timestamp || !signatureHeader) return { ok: false, reason: 'missing_headers' }

    const ts = Number(timestamp)
    if (!Number.isFinite(ts)) return { ok: false, reason: 'stale_timestamp' }
    if (Math.abs(nowMs / 1000 - ts) > TOLERANCE_SECONDS) return { ok: false, reason: 'stale_timestamp' }

    // O segredo vem como `whsec_<base64>`; o prefixo NÃO faz parte da chave.
    const keyB64 = whsec.startsWith('whsec_') ? whsec.slice('whsec_'.length) : whsec
    let key: Buffer
    try {
        key = Buffer.from(keyB64, 'base64')
    } catch {
        return { ok: false, reason: 'not_configured' }
    }
    if (!key.length) return { ok: false, reason: 'not_configured' }

    const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest()

    // O header traz N assinaturas separadas por espaço (durante rotação do
    // segredo, a antiga e a nova convivem). Basta UMA bater.
    for (const part of signatureHeader.split(' ')) {
        const comma = part.indexOf(',')
        if (comma < 0) continue
        if (part.slice(0, comma) !== 'v1') continue
        let candidate: Buffer
        try {
            candidate = Buffer.from(part.slice(comma + 1), 'base64')
        } catch {
            continue
        }
        // `timingSafeEqual` exige mesmo tamanho — comparar antes não vaza nada
        // útil, porque o tamanho de um HMAC-SHA256 é público (32 bytes).
        if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
            return { ok: true }
        }
    }

    return { ok: false, reason: 'bad_signature' }
}

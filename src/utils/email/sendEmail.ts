/**
 * Envio de e-mail transacional (Resend) com resultado VERIFICÁVEL.
 *
 * Por que este arquivo existe (auditoria ago/2026):
 *
 * O envio do e-mail de aprovação era um `fetch(...).catch(() => null)` inline
 * na rota. Três buracos, todos silenciosos:
 *
 *   1. sem chave configurada → `return` mudo, nenhum sinal em lugar nenhum;
 *   2. resposta 4xx/5xx da Resend (domínio não verificado, chave revogada,
 *      destinatário em supressão) → `fetch` RESOLVE, ninguém olhava `res.ok`,
 *      e a rota respondia "Acesso liberado e e-mail enviado";
 *   3. erro de rede → engolido pelo `.catch`, que também matava o
 *      `emailWarning` da rota: o aviso na UI do admin era código morto.
 *
 * E `logWarn` é no-op em produção (`if (IS_PROD) return`), então mesmo o que
 * tentava logar não logava. A tela de espera promete "Aguarde o e-mail de
 * aprovação" — prometer e não saber se cumpriu é o pior dos dois mundos.
 *
 * Aqui a função NUNCA lança (uma falha de e-mail não pode derrubar a aprovação,
 * que já está gravada no banco) mas SEMPRE devolve o que aconteceu, para quem
 * chamou registrar.
 */

import { env } from '@/utils/env'
import { logError } from '@/lib/logger'

/** Motivo da falha — o suficiente para o admin saber o que fazer. */
export type EmailFailureReason =
    /** `RESEND_API_KEY` ou `RESEND_FROM` ausente no ambiente. */
    | 'not_configured'
    /** Destinatário vazio ou sem cara de e-mail. */
    | 'invalid_recipient'
    /** A Resend respondeu, e respondeu erro. `detail` traz o corpo. */
    | 'provider_error'
    /** Não houve resposta: rede, DNS, timeout. */
    | 'network_error'

export type EmailResult =
    | { ok: true; id: string | null }
    | { ok: false; reason: EmailFailureReason; detail?: string }

export interface SendEmailInput {
    to: string
    subject: string
    html: string
    /** Alternativa em texto. Sem ela o e-mail pontua pior em filtro de spam. */
    text: string
    /** Para quem responde ao `noreply@`. Sem isto, a resposta some. */
    replyTo?: string
}

const TIMEOUT_MS = 10_000
/** Só o suficiente para descartar lixo — a validação de verdade é do provedor. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Corta o corpo do erro: vai para log e auditoria, não pode virar dump. */
const MAX_DETAIL = 300

export async function sendTransactionalEmail(input: SendEmailInput): Promise<EmailResult> {
    const apiKey = String(env.resend.apiKey || '').trim()
    const from = String(env.resend.from || '').trim()
    if (!apiKey || !from) {
        // Config faltando é problema de INFRA, não do usuário: precisa gritar.
        // `logError` porque `logWarn` não escreve nada em produção.
        logError('email:send', new Error('resend_not_configured'), {
            hasApiKey: Boolean(apiKey), hasFrom: Boolean(from),
        })
        return { ok: false, reason: 'not_configured' }
    }

    const to = String(input?.to || '').trim()
    if (!to || !EMAIL_SHAPE.test(to)) return { ok: false, reason: 'invalid_recipient' }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from,
                to: [to],
                subject: input.subject,
                html: input.html,
                text: input.text,
                ...(input.replyTo ? { reply_to: input.replyTo } : {}),
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })

        // O ponto da auditoria: `fetch` resolver NÃO significa e-mail aceito.
        if (!res.ok) {
            const detail = (await res.text().catch(() => '')).slice(0, MAX_DETAIL)
            logError('email:send', new Error(`resend_http_${res.status}`), { status: res.status, detail })
            return { ok: false, reason: 'provider_error', detail: `HTTP ${res.status}: ${detail}` }
        }

        // O id é o rastro: com ele dá para achar a entrega no painel da Resend.
        const body = (await res.json().catch(() => null)) as { id?: string } | null
        return { ok: true, id: body?.id ? String(body.id) : null }
    } catch (e) {
        const detail = e instanceof Error ? e.message : String(e)
        logError('email:send', e, { to: to.replace(/^(.).*(@.*)$/, '$1***$2') })
        return { ok: false, reason: 'network_error', detail: detail.slice(0, MAX_DETAIL) }
    }
}

/** Texto curto pro admin — ele precisa saber o que fazer, não o stack trace. */
export function describeEmailFailure(reason: EmailFailureReason): string {
    switch (reason) {
        case 'not_configured':
            return 'O envio de e-mail não está configurado no servidor (RESEND_API_KEY / RESEND_FROM).'
        case 'invalid_recipient':
            return 'O e-mail cadastrado na solicitação é inválido.'
        case 'provider_error':
            return 'O provedor de e-mail recusou o envio.'
        case 'network_error':
            return 'Não foi possível falar com o provedor de e-mail.'
    }
}

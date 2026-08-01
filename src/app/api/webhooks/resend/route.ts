/**
 * API: POST /api/webhooks/resend — o que ACONTECEU com o e-mail depois de sair.
 *
 * POR QUE EXISTE (auditoria ago/2026):
 *
 * A rota de aprovação já sabia se a Resend ACEITOU o envio (HTTP 200). Só que
 * aceitar não é entregar. Em 23/07 o e-mail de aprovação de uma aluna foi
 * aceito, respondeu 200, e nunca chegou: a caixa dela no iCloud estava cheia.
 * O bounce veio depois, assíncrono, e não existia nada escutando — nem o app
 * nem o dono ficaram sabendo. Ela foi aprovada e continuou vendo a tela de
 * espera.
 *
 * Nenhuma checagem no momento do envio resolve isso, porque o veredito só
 * existe minutos depois. Este webhook é o único caminho.
 *
 * SEGURANÇA: endpoint público que escreve no banco. Toda requisição passa por
 * assinatura Svix (`utils/email/verifySvixSignature`) sobre o corpo CRU.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { verifySvixSignature } from '@/utils/email/verifySvixSignature'
import { env } from '@/utils/env'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/** Corpo maior que isso não é webhook da Resend — é alguém sondando. */
const MAX_BODY_BYTES = 100_000

/**
 * Só os eventos que mudam o que o admin precisa saber.
 *
 * `opened` e `clicked` ficam de fora de propósito: são rastreamento de
 * comportamento, não entregabilidade, e gravá-los por usuário sem necessidade
 * seria coletar dado que ninguém pediu.
 */
const TRACKED: Record<string, string> = {
    'email.delivered': 'email_delivery_delivered',
    'email.bounced': 'email_delivery_bounced',
    'email.complained': 'email_delivery_complained',
    'email.failed': 'email_delivery_failed',
    'email.delivery_delayed': 'email_delivery_delayed',
    'email.suppressed': 'email_delivery_suppressed',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
    try {
        // Corpo CRU: `JSON.parse` + `stringify` reordena chaves e a assinatura
        // deixa de bater. Ler como texto é obrigatório aqui.
        const rawBody = await req.text()
        if (rawBody.length > MAX_BODY_BYTES) {
            return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 })
        }

        const verdict = verifySvixSignature(
            rawBody,
            {
                id: req.headers.get('svix-id'),
                timestamp: req.headers.get('svix-timestamp'),
                signature: req.headers.get('svix-signature'),
            },
            env.resend.webhookSecret,
        )
        if (!verdict.ok) {
            // Segredo faltando é erro de INFRA — precisa gritar, senão o webhook
            // fica recusando tudo em silêncio e voltamos a não enxergar bounce.
            if (verdict.reason === 'not_configured') {
                logError('webhooks:resend', new Error('RESEND_WEBHOOK_SECRET ausente'))
                return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 500 })
            }
            return NextResponse.json({ ok: false, error: verdict.reason }, { status: 401 })
        }

        let payload: { type?: string; data?: { email_id?: string; to?: unknown; subject?: string } }
        try {
            payload = JSON.parse(rawBody)
        } catch {
            return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
        }

        const type = String(payload?.type || '')
        const action = TRACKED[type]
        // 2xx em evento que não acompanhamos: devolver erro faria a Resend
        // reenviar para sempre um evento que nunca vamos querer.
        if (!action) return NextResponse.json({ ok: true, ignored: type || 'unknown' })

        const emailId = String(payload?.data?.email_id || '').trim()
        if (!UUID.test(emailId)) {
            return NextResponse.json({ ok: false, error: 'missing_email_id' }, { status: 400 })
        }

        const to = Array.isArray(payload?.data?.to)
            ? payload.data.to.map((v) => String(v)).slice(0, 5)
            : []
        const svixId = String(req.headers.get('svix-id') || '')

        const admin = createAdminClient()

        // A Resend REENVIA em caso de timeout, então o mesmo evento chega duas
        // vezes. Sem isto, um bounce viraria três bounces no histórico.
        const { data: seen } = await admin
            .from('audit_events')
            .select('id')
            .eq('entity_type', 'email')
            .eq('entity_id', emailId)
            .eq('metadata->>svix_id', svixId)
            .maybeSingle()
        if (seen) return NextResponse.json({ ok: true, duplicate: true })

        const { error } = await admin.from('audit_events').insert({
            actor_id: null,
            actor_email: null,
            actor_role: 'system',
            action,
            entity_type: 'email',
            entity_id: emailId,
            metadata: {
                type,
                svix_id: svixId,
                to,
                subject: String(payload?.data?.subject || '').slice(0, 200) || null,
            },
        })
        if (error) {
            // 500 faz a Resend tentar de novo — é o que queremos quando o banco
            // falhou: o evento não pode simplesmente evaporar.
            logError('webhooks:resend', error, { type, emailId })
            return NextResponse.json({ ok: false, error: 'persist_failed' }, { status: 500 })
        }

        return NextResponse.json({ ok: true })
    } catch (e) {
        logError('webhooks:resend', e)
        return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
    }
}

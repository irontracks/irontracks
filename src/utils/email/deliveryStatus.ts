/**
 * Junta as duas metades da história de um e-mail de aprovação.
 *
 * Metade 1 — o ENVIO: a rota de aprovação grava `approval_email_sent` (ou
 * `_failed`) em `audit_events`, com `metadata.provider_id` = o id da Resend.
 *
 * Metade 2 — a ENTREGA: o webhook grava `email_delivery_*` com esse mesmo id em
 * `entity_id`. Ele chega minutos depois, assíncrono.
 *
 * Sem cruzar as duas, o painel só sabe dizer "a Resend aceitou" — que foi
 * exatamente o que ele dizia no dia em que uma aprovação virou bounce e ninguém
 * viu (23/07, caixa do destinatário cheia).
 *
 * Lógica pura para poder ser testada sem banco.
 */

/** Ordem de gravidade: o que o admin precisa ver ganha do que já passou. */
const RANK: Record<string, number> = {
    bounced: 5,
    complained: 5,
    failed: 5,
    suppressed: 4,
    send_failed: 5,
    delayed: 3,
    delivered: 2,
    sent: 1,
}

export type DeliveryState =
    /** A Resend recusou o envio na hora — nem chegou a existir e-mail. */
    | 'send_failed'
    /** Aceito pela Resend; ainda sem veredito de entrega. */
    | 'sent'
    /** Confirmado na caixa do destinatário. */
    | 'delivered'
    /** Problema temporário; a Resend ainda tenta. */
    | 'delayed'
    /** Não chegou, e não vai chegar sem ação. */
    | 'bounced'
    /** O destinatário marcou como spam. */
    | 'complained'
    | 'failed'
    | 'suppressed'
    /** Nenhum registro — aprovação anterior a esta instrumentação. */
    | 'unknown'

export interface EmailDeliveryStatus {
    state: DeliveryState
    /** Legenda curta para o painel. */
    label: string
    /** `true` quando o admin precisa agir (avisar a pessoa por fora). */
    needsAttention: boolean
    at: string | null
}

export interface AuditRow {
    action: string
    entity_id: string | null
    created_at: string
    metadata: Record<string, unknown> | null
}

const LABEL: Record<DeliveryState, string> = {
    send_failed: 'Falhou no envio',
    sent: 'Enviado',
    delivered: 'Entregue',
    delayed: 'Atrasado',
    bounced: 'Não chegou',
    complained: 'Marcado como spam',
    failed: 'Falhou',
    suppressed: 'Bloqueado',
    unknown: 'Sem registro',
}

const NEEDS_ATTENTION: ReadonlySet<DeliveryState> = new Set<DeliveryState>([
    'send_failed', 'bounced', 'complained', 'failed', 'suppressed',
])

function stateFromAction(action: string): DeliveryState | null {
    if (action === 'approval_email_sent') return 'sent'
    if (action === 'approval_email_failed') return 'send_failed'
    if (action.startsWith('email_delivery_')) {
        const tail = action.slice('email_delivery_'.length)
        return (tail in RANK ? tail : null) as DeliveryState | null
    }
    return null
}

/**
 * @param sendEvents  eventos `approval_email_*` da solicitação
 * @param deliveryByProviderId  eventos `email_delivery_*` indexados pelo id da Resend
 */
export function resolveDeliveryStatus(
    sendEvents: readonly AuditRow[],
    deliveryByProviderId: ReadonlyMap<string, readonly AuditRow[]>,
): EmailDeliveryStatus {
    const candidates: Array<{ state: DeliveryState; at: string }> = []

    for (const ev of sendEvents) {
        const state = stateFromAction(ev.action)
        if (state) candidates.push({ state, at: ev.created_at })

        const providerId = String(ev.metadata?.provider_id ?? '')
        if (!providerId) continue
        for (const d of deliveryByProviderId.get(providerId) ?? []) {
            const ds = stateFromAction(d.action)
            if (ds) candidates.push({ state: ds, at: d.created_at })
        }
    }

    if (!candidates.length) {
        return { state: 'unknown', label: LABEL.unknown, needsAttention: false, at: null }
    }

    // Mais grave primeiro; empate desempata pelo mais recente. Um `delivered`
    // não pode apagar um `complained` que veio depois.
    candidates.sort((a, b) =>
        (RANK[b.state] ?? 0) - (RANK[a.state] ?? 0) || Date.parse(b.at) - Date.parse(a.at))

    const top = candidates[0]
    return {
        state: top.state,
        label: LABEL[top.state],
        needsAttention: NEEDS_ATTENTION.has(top.state),
        at: top.at,
    }
}

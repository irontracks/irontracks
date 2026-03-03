import { createAdminClient } from '@/utils/supabase/admin'
import { logWarn } from '@/lib/logger'

/**
 * Inserts a failed webhook event into the dead letter queue for manual review.
 */
export async function insertDeadLetter(opts: {
    source: 'mercadopago' | 'asaas'
    eventType?: string
    payload: unknown
    errorMessage: string
    attempts?: number
}): Promise<void> {
    try {
        const admin = createAdminClient()
        await admin.from('webhook_dead_letters').insert({
            source: opts.source,
            event_type: opts.eventType || null,
            payload: opts.payload || {},
            error_message: opts.errorMessage,
            attempts: opts.attempts || 1,
        })
    } catch (e) {
        logWarn('deadLetter', 'Failed to insert dead letter', e)
    }
}

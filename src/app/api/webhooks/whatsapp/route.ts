/**
 * POST /api/webhooks/whatsapp
 *
 * Receives incoming WhatsApp messages from Z-API, generates an AI reply
 * via Gemini, sends it back, and updates the conversation state in Supabase.
 *
 * Configure this URL in the Z-API dashboard under "On Message Received".
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { logError, logInfo, logWarn } from '@/lib/logger'
import { sendWhatsAppText } from '@/lib/whatsapp/zapi'
import { generateReply, fetchUserContext } from '@/lib/whatsapp/conversation'
import type { ConversationTurn } from '@/lib/whatsapp/conversation'
import { env } from '@/utils/env'
import { parseJsonBody } from '@/utils/zod'
import { cacheSetNx } from '@/utils/cache'

export const dynamic = 'force-dynamic'

// Z-API webhook payload é amplo e varia por evento — usamos passthrough
// pra preservar todas as keys e validamos os campos relevantes inline.
const ZapiBodySchema = z.object({}).passthrough()

/**
 * Constant-time string comparison so we don't leak length/timing info to a
 * caller probing the webhook secret.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/**
 * Brazilian mobile numbers should have a leading "9" after the DDD (since
 * the 2010 reform). Z-API sometimes drops it (12-digit form) while our DB
 * stores the 13-digit form, or vice-versa. Return both candidates so the
 * conversation lookup matches either format.
 */
function brPhoneCandidates(raw: string): string[] {
  const digits = raw.replace(/@.+$/, '').replace(/\D/g, '')
  if (!digits) return []

  // 12 digits: 55 + DDD(2) + local(8) — add the leading 9
  if (digits.length === 12 && digits.startsWith('55')) {
    return [digits, `${digits.slice(0, 4)}9${digits.slice(4)}`]
  }
  // 13 digits with leading 9 after DDD — also try without it
  if (digits.length === 13 && digits.startsWith('55') && digits.charAt(4) === '9') {
    return [digits, `${digits.slice(0, 4)}${digits.slice(5)}`]
  }
  return [digits]
}

export async function POST(req: Request) {
  try {
    // ── Security: verify Z-API client token ────────────────────────────────
    // Z-API sends the token configured under "Account → Security" on every
    // webhook in the `client-token` header. Reject anything else outright.
    const expectedToken = env.zapi.clientToken.trim()
    if (!expectedToken) {
      logError('webhook:whatsapp', new Error('ZAPI_CLIENT_TOKEN not configured — rejecting all webhooks'))
      return NextResponse.json({ ok: false, error: 'webhook_not_configured' }, { status: 500 })
    }
    const provided = String(req.headers.get('client-token') || '').trim()
    if (!provided || !safeEqual(provided, expectedToken)) {
      logWarn('webhook:whatsapp', 'Rejected request without valid client-token', {
        hasHeader: provided.length > 0,
      })
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const parsed = await parseJsonBody(req, ZapiBodySchema)
    const body = (parsed.data ?? {}) as Record<string, unknown>

    // Ignore messages we sent ourselves, group messages, or empty payloads
    if (Boolean(body.fromMe) || Boolean(body.isGroup)) return NextResponse.json({ ok: true })

    // Z-API v2 sends text messages as { text: { message: "..." } }
    // Older versions / some event types may still use body.body or body.caption
    const textObj = body.text as Record<string, unknown> | undefined
    const text = (
      String(textObj?.message ?? '').trim() ||
      String(body.body ?? '').trim() ||
      String(body.caption ?? '').trim()
    )

    const phoneOptions = brPhoneCandidates(String(body.phone ?? ''))
    if (phoneOptions.length === 0 || !text) return NextResponse.json({ ok: true })

    // Replay/idempotência: Z-API pode reentregar a mesma mensagem (retries de webhook).
    // Sem dedupe, cada reentrega gera uma nova resposta de IA — custo Gemini duplicado
    // e mensagem repetida pro usuário. Janela curta por messageId. Se o id não vier,
    // segue (fail-open, pra não engolir mensagem legítima). Auditoria 2026-06-28 (R2).
    const messageId = String(body.messageId ?? body.id ?? '').trim()
    if (messageId) {
      const isNew = await cacheSetNx(`webhook:whatsapp:msg:${messageId}`, '1', 600)
      if (!isNew) return NextResponse.json({ ok: true, deduped: true })
    }

    const phone = phoneOptions[0] // canonical phone for sending the reply

    logInfo('webhook:whatsapp', 'Incoming message', { phone: `****${phone.slice(-4)}` })

    const admin = createAdminClient()

    // Find the most recent conversation (active or recently resolved) for this
    // phone. If the user replies after the bot resolved the conversation, we
    // re-engage on the same thread instead of going silent — but only within a
    // 24h window to avoid bringing back stale conversations from days ago.
    const reactivateCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('id, user_id, context, status, last_message_at')
      .in('phone', phoneOptions)
      .in('status', ['active', 'resolved'])
      .gte('last_message_at', reactivateCutoff)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!conv) return NextResponse.json({ ok: true })

    const history = (Array.isArray(conv.context) ? conv.context : []) as ConversationTurn[]
    const userCtx = await fetchUserContext(String(conv.user_id))

    // Generate AI reply
    const { message, shouldClose } = await generateReply(text, history, userCtx)

    // Send the reply back
    await sendWhatsAppText(phone, message)

    // Persist updated conversation
    const updatedHistory: ConversationTurn[] = [
      ...history,
      { role: 'user', text },
      { role: 'model', text: message },
    ]

    await admin
      .from('whatsapp_conversations')
      .update({
        context: updatedHistory,
        last_user_message: text,
        last_bot_message: message,
        last_message_at: new Date().toISOString(),
        status: shouldClose ? 'resolved' : 'active',
      })
      .eq('id', String(conv.id))

    logInfo('webhook:whatsapp', shouldClose ? 'Conversation resolved' : 'Reply sent', {
      convId: conv.id,
      phone: `****${phone.slice(-4)}`,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    logError('webhook:whatsapp', e)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}

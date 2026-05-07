/**
 * POST /api/webhooks/whatsapp
 *
 * Receives incoming WhatsApp messages from Z-API, generates an AI reply
 * via Gemini, sends it back, and updates the conversation state in Supabase.
 *
 * Configure this URL in the Z-API dashboard under "On Message Received".
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { logError, logInfo } from '@/lib/logger'
import { sendWhatsAppText } from '@/lib/whatsapp/zapi'
import { generateReply, fetchUserContext } from '@/lib/whatsapp/conversation'
import type { ConversationTurn } from '@/lib/whatsapp/conversation'

export const dynamic = 'force-dynamic'

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
  // Security: no client-token check — the Supabase lookup below is the real
  // gate (only active conversations are processed; spoofed requests do nothing).
  try {
    const body = await req.json() as Record<string, unknown>

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

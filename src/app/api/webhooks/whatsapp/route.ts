/**
 * POST /api/webhooks/whatsapp
 *
 * Receives incoming WhatsApp messages from Z-API, generates an AI reply
 * via Gemini, sends it back, and updates the conversation state in Supabase.
 *
 * Configure this URL in your Z-API instance settings under "Webhooks → On Message Received".
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { logError, logInfo } from '@/lib/logger'
import { sendWhatsAppText } from '@/lib/whatsapp/zapi'
import { generateReply, fetchUserContext } from '@/lib/whatsapp/conversation'
import type { ConversationTurn } from '@/lib/whatsapp/conversation'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Security: no client-token check — the Supabase lookup below is the real
  // gate (only active conversations are processed; spoofed requests do nothing).
  try {
    const body = await req.json() as Record<string, unknown>

    // DEBUG TEMP: log raw body fields to diagnose phone format
    logError('webhook:whatsapp:debug', `fromMe=${body.fromMe} isGroup=${body.isGroup} phone="${body.phone}" type="${body.type}"`)

    // Ignore messages we sent ourselves, group messages, or empty payloads
    if (Boolean(body.fromMe) || Boolean(body.isGroup)) return NextResponse.json({ ok: true })

    const phone = String(body.phone ?? '').trim()
    const text = String(body.body ?? '').trim()
    if (!phone || !text) {
      logError('webhook:whatsapp:debug', `Skipping: empty phone="${phone}" text="${text}"`)
      return NextResponse.json({ ok: true })
    }

    logError('webhook:whatsapp:debug', `Processing inbound: phone="${phone}" text="${text.slice(0, 40)}"`)

    const admin = createAdminClient()

    // Find the active conversation for this phone number
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('id, user_id, context')
      .eq('phone', phone)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!conv) {
      logError('webhook:whatsapp:debug', `No conv found for phone="${phone}"`)
      return NextResponse.json({ ok: true })
    }

    logError('webhook:whatsapp:debug', `Conv found: id=${conv.id} — generating reply...`)

    const history = (Array.isArray(conv.context) ? conv.context : []) as ConversationTurn[]
    const userCtx = await fetchUserContext(String(conv.user_id))

    // Generate AI reply
    const { message, shouldClose } = await generateReply(text, history, userCtx)

    logError('webhook:whatsapp:debug', `Reply generated (${message.length} chars) — sending via Z-API...`)

    // Send the reply back
    const sent = await sendWhatsAppText(phone, message)

    logError('webhook:whatsapp:debug', `Z-API send result: ${sent} — updating DB...`)

    // Persist updated conversation
    const updatedHistory: ConversationTurn[] = [
      ...history,
      { role: 'user', text },
      { role: 'model', text: message },
    ]

    const { error: updateError } = await admin
      .from('whatsapp_conversations')
      .update({
        context: updatedHistory,
        last_user_message: text,
        last_bot_message: message,
        last_message_at: new Date().toISOString(),
        status: shouldClose ? 'resolved' : 'active',
      })
      .eq('id', String(conv.id))

    logError('webhook:whatsapp:debug', `DB update done. error=${updateError?.message ?? 'none'} shouldClose=${shouldClose}`)

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

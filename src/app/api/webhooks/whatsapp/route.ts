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

    // DEBUG: log extracted fields to diagnose real Z-API payload structure
    const textObj = body.text as Record<string, unknown> | undefined
    logError('webhook:zapi:debug', JSON.stringify({
      type: body.type,
      fromMe: body.fromMe,
      isGroup: body.isGroup,
      phone: body.phone,
      textMsg: textObj?.message,
      bodyField: body.body,
      caption: body.caption,
      status: body.status,
    }))

    // Ignore messages we sent ourselves, group messages, or empty payloads
    if (Boolean(body.fromMe) || Boolean(body.isGroup)) return NextResponse.json({ ok: true })

    const phone = String(body.phone ?? '').trim()

    // Z-API v2 sends text messages as { text: { message: "..." } }
    // Older versions / some event types may still use body.body
    const text = (
      String(textObj?.message ?? '').trim() ||
      String(body.body ?? '').trim() ||
      String(body.caption ?? '').trim()
    )

    logError('webhook:zapi:extracted', JSON.stringify({ phone, text: text.slice(0, 80), hasConv: null }))

    if (!phone || !text) return NextResponse.json({ ok: true })

    logInfo('webhook:whatsapp', 'Incoming message', { phone: `****${phone.slice(-4)}` })

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

    logError('webhook:zapi:conv', JSON.stringify({ found: !!conv, convId: conv?.id ?? null }))
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

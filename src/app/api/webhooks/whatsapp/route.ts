/**
 * POST /api/webhooks/whatsapp
 *
 * Receives incoming WhatsApp messages from Z-API, generates an AI reply
 * via Gemini, sends it back, and updates the conversation state in Supabase.
 *
 * Configure this URL in your Z-API instance settings under "Webhooks → On Message Received".
 * Optional: set a Client Token in Z-API and add it as ZAPI_CLIENT_TOKEN env var.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { logError, logInfo, logWarn } from '@/lib/logger'
import { sendWhatsAppText } from '@/lib/whatsapp/zapi'
import { generateReply, fetchUserContext } from '@/lib/whatsapp/conversation'
import type { ConversationTurn } from '@/lib/whatsapp/conversation'
import { env } from '@/utils/env'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Validate Z-API Client Token if configured (recommended in production)
  const clientToken = env.zapi.clientToken.trim()
  if (clientToken) {
    const incoming = (req.headers.get('client-token') ?? '').trim()
    // Log the incoming token for debugging (truncated)
    logInfo('webhook:whatsapp', `Token check — expected="${clientToken.slice(0,8)}..." incoming="${incoming.slice(0,8)}..." match=${incoming === clientToken}`)
    if (incoming !== clientToken) {
      logWarn('webhook:whatsapp', 'Invalid client-token — rejected')
      return NextResponse.json({ ok: false }, { status: 403 })
    }
  }

  try {
    const body = await req.json() as Record<string, unknown>

    // Ignore messages we sent ourselves, group messages, or empty payloads
    if (Boolean(body.fromMe) || Boolean(body.isGroup)) return NextResponse.json({ ok: true })

    const phone = String(body.phone ?? '').trim()
    const text = String(body.body ?? '').trim()
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

    if (!conv) {
      // User replied to an old/closed conversation — silently ignore
      logInfo('webhook:whatsapp', 'No active conversation for phone', { phone: `****${phone.slice(-4)}` })
      return NextResponse.json({ ok: true })
    }

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

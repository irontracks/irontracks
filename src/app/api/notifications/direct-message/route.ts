import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPushToAllPlatforms as sendPushToUsers } from '@/lib/push/sender'
import { logError } from '@/lib/logger'
import { waitUntil } from '@vercel/functions'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    receiverId: z.string().min(1),
    senderName: z.string().min(1),
    preview: z.string().min(1),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body: Record<string, unknown> = parsedBody.data!
    const receiverId = String(body?.receiverId || '').trim()
    const senderName = String(body?.senderName || '').trim()
    const preview = String(body?.preview || '').trim()

    if (!receiverId || !senderName || !preview) {
      return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    }

    // R4#4: receiverId is the RECIPIENT, user.id is the SENDER
    // Prevent sending notifications to yourself
    if (receiverId === user.id) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const safeSenderName = senderName.slice(0, 80)
    const safePreview = preview.slice(0, 240)
    if (!safeSenderName || !safePreview) {
      return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Only allow the notification if sender and receiver already share a private
    // channel (i.e. the invite was accepted). Otherwise any authenticated user
    // could post in-app notifications to any user_id (phishing vector).
    const { data: shares, error: sharesError } = await admin.rpc('users_share_private_channel', {
      p_a: user.id,
      p_b: receiverId,
    })

    if (sharesError) {
      logError('notifications:direct-message', 'users_share_private_channel RPC failed:', sharesError)
      return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 })
    }

    if (shares !== true) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data: prefRow } = await admin
      .from('user_settings')
      .select('preferences')
      .eq('user_id', receiverId)
      .maybeSingle()

    const prefs = prefRow?.preferences && typeof prefRow.preferences === 'object' ? prefRow.preferences : null
    const allow = prefs ? prefs.notifyDirectMessages !== false : true
    if (!allow) return NextResponse.json({ ok: true, skipped: true })

    const { error } = await admin.from('notifications').insert({
      user_id: receiverId,
      title: safeSenderName,
      message: safePreview,
      type: 'message',
      is_read: false,
      read: false,
    })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    // Fire push notification to the RECEIVER.
    // The sender enforces both the master switch AND the notifyDirectMessages
    // per-type pref, so we pass the key for consistency.
    waitUntil(
      sendPushToUsers(
        [receiverId],
        `💬 ${safeSenderName}`,
        safePreview,
        {
          type: 'message',
          // Passed to the Notification Service Extension so it can build an
          // INSendMessageIntent → Communication Notification (guaranteed screen wake).
          sender_name: safeSenderName,
          sender_id: user.id,
          conversation_id: `dm-${[user.id, receiverId].sort().join('-')}`,
        },
        { preferenceKey: 'notifyDirectMessages' },
      ).catch(() => { })
    )

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}

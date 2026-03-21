import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPushToAllPlatforms as sendPushToUsers } from '@/lib/push/sender'

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

    // Fire push notification to the RECEIVER
    void sendPushToUsers([receiverId], `💬 ${safeSenderName}`, safePreview).catch(() => { })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}

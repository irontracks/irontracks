/**
 * POST /api/push/clear-badge
 *
 * Sends an APNs silent push with badge=0 to all iOS devices of the
 * authenticated user. Called when the user opens the notification center
 * and all notifications are marked as read.
 *
 * This eliminates the "ghost badge" on the iOS app icon that persists
 * even after the user has read all notifications inside the app.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { sendPushToUsers } from '@/lib/push/apns'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    // Send a silent push with badge=0 — clears the iOS app icon badge
    // Uses APNs directly since FCM doesn't support badge count natively
    await sendPushToUsers(
      [user.id],
      '', // empty title = silent push
      '', // empty body  = silent push
      { __badge: 0, 'content-available': 1 },
    ).catch(() => { /* best-effort — don't fail the request */ })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

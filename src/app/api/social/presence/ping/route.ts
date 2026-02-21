import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  filterRecipientsByPreference,
  insertNotifications,
  listFollowerIdsOf,
  shouldThrottleBySenderType,
} from '@/lib/social/notifyFollowers'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const throttled = await shouldThrottleBySenderType(userId, 'friend_online', 15)
    if (throttled) return NextResponse.json({ ok: true, throttled: true })

    const admin = createAdminClient()
    const { data: me } = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle()
    const name = String(me?.display_name || '').trim() || 'Seu amigo'

    const followerIds = await listFollowerIdsOf(userId)
    const recipients = await filterRecipientsByPreference(followerIds, 'notifyFriendOnline')
    if (!recipients.length) return NextResponse.json({ ok: true, sent: 0 })

    const rows = recipients.map((rid) => ({
      user_id: rid,
      recipient_id: rid,
      sender_id: userId,
      type: 'friend_online',
      title: 'Amigo online',
      message: `${name} entrou no app.`,
      read: false,
      is_read: false,
      metadata: { sender_id: userId },
    }))

    const res = await insertNotifications(rows)
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error || 'failed' }, { status: 400 })

    return NextResponse.json({ ok: true, sent: res.inserted })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}


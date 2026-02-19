import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { filterRecipientsByPreference, insertNotifications } from '@/lib/social/notifyFollowers'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    notification_id: z.string().optional(),
    follower_id: z.string().optional(),
    decision: z.enum(['accept', 'deny']),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const notificationId = String(body?.notification_id || '').trim()
    let followerId = String(body?.follower_id || '').trim()
    const decision = String(body?.decision || '').trim().toLowerCase()
    const followingId = String(auth.user.id || '').trim()

    if (decision !== 'accept' && decision !== 'deny') return NextResponse.json({ ok: false, error: 'invalid decision' }, { status: 400 })

    if (!followerId && notificationId) {
      try {
        const { data: notif } = await auth.supabase
          .from('notifications')
          .select('sender_id, metadata, type')
          .eq('user_id', followingId)
          .eq('id', notificationId)
          .maybeSingle()
        const type = String(notif?.type || '').toLowerCase()
        if (type === 'follow_request') {
          const meta = notif?.metadata && typeof notif.metadata === 'object' ? (notif.metadata as any) : null
          followerId = String(notif?.sender_id ?? meta?.follower_id ?? '').trim()
        }
      } catch {}
    }

    if (!followerId) {
      if (notificationId) {
        try {
          await auth.supabase.from('notifications').update({ read: true, is_read: true }).eq('user_id', followingId).eq('id', notificationId)
        } catch {}
        return NextResponse.json({ ok: true, already: true })
      }
      return NextResponse.json({ ok: false, error: 'missing follower_id' }, { status: 400 })
    }

    if (decision === 'accept') {
      const { data, error } = await auth.supabase
        .from('social_follows')
        .update({ status: 'accepted' })
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .eq('status', 'pending')
        .select('follower_id')
        .limit(1)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      const updated = Array.isArray(data) && data.length > 0
      if (!updated) {
        try {
          await auth.supabase
            .from('notifications')
            .update({ read: true, is_read: true })
            .eq('user_id', followingId)
            .eq('type', 'follow_request')
            .eq('sender_id', followerId)
        } catch {}
        return NextResponse.json({ ok: true, already: true })
      }
    } else {
      const { data, error } = await auth.supabase
        .from('social_follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .eq('status', 'pending')
        .select('follower_id')
        .limit(1)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      const deleted = Array.isArray(data) && data.length > 0
      if (!deleted) {
        try {
          await auth.supabase
            .from('notifications')
            .update({ read: true, is_read: true })
            .eq('user_id', followingId)
            .eq('type', 'follow_request')
            .eq('sender_id', followerId)
        } catch {}
        return NextResponse.json({ ok: true, already: true })
      }
    }

    try {
      await auth.supabase
        .from('notifications')
        .update({ read: true, is_read: true })
        .eq('user_id', followingId)
        .eq('type', 'follow_request')
        .eq('sender_id', followerId)
    } catch {}

    if (notificationId) {
      try {
        await auth.supabase.from('notifications').update({ read: true, is_read: true }).eq('user_id', followingId).eq('id', notificationId)
      } catch {}
    }

    if (decision === 'accept') {
      const admin = createAdminClient()
      const { data: followingProfile } = await admin
        .from('profiles')
        .select('display_name')
        .eq('id', followingId)
        .maybeSingle()

      const followingName = String(followingProfile?.display_name || '').trim() || 'Seu amigo'
      const recipients = await filterRecipientsByPreference([followerId], 'notifySocialFollows')
      if (recipients.length) {
        await insertNotifications([
          {
            user_id: followerId,
            recipient_id: followerId,
            sender_id: followingId,
            type: 'follow_accepted',
            title: 'Solicitação aceita',
            message: `${followingName} aceitou seu pedido.`,
            read: false,
            is_read: false,
            metadata: { follower_id: followerId, following_id: followingId },
          },
        ])
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

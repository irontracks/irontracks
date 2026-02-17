import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { filterRecipientsByPreference, insertNotifications } from '@/lib/social/notifyFollowers'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    following_id: z.string().min(1),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const followingId = String(body?.following_id || '').trim()
    const followerId = String(auth.user.id || '').trim()
    if (!followingId) return NextResponse.json({ ok: false, error: 'missing following_id' }, { status: 400 })
    if (followingId === followerId) return NextResponse.json({ ok: false, error: 'invalid follow' }, { status: 400 })

    const admin = createAdminClient()
    try {
      const { data: settings } = await admin
        .from('user_settings')
        .select('preferences')
        .eq('user_id', followingId)
        .maybeSingle()
      const prefs = settings?.preferences && typeof settings.preferences === 'object' ? settings.preferences : null
      if (prefs && prefs.allowSocialFollows === false) {
        return NextResponse.json({ ok: false, error: 'user_not_accepting_follows' }, { status: 403 })
      }
    } catch {}

    const { error } = await auth.supabase
      .from('social_follows')
      .insert({ follower_id: followerId, following_id: followingId, status: 'pending' })

    if (error) {
      const msg = String(error?.message || '')
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        const { data: existing } = await auth.supabase
          .from('social_follows')
          .select('status')
          .eq('follower_id', followerId)
          .eq('following_id', followingId)
          .maybeSingle()

        const currentStatus = existing?.status === 'accepted' ? 'accepted' : existing?.status === 'pending' ? 'pending' : null
        if (currentStatus === 'pending') {
          const { data: followerProfile } = await admin
            .from('profiles')
            .select('display_name')
            .eq('id', followerId)
            .maybeSingle()

          const followerName = String(followerProfile?.display_name || '').trim() || 'Alguém'
          const recipients = await filterRecipientsByPreference([followingId], 'notifySocialFollows')
          let notified = false
          if (recipients.length) {
            try {
              await admin
                .from('notifications')
                .delete()
                .eq('user_id', followingId)
                .eq('type', 'follow_request')
                .eq('sender_id', followerId)
            } catch {}

            const inserted = await insertNotifications([
              {
                user_id: followingId,
                recipient_id: followingId,
                sender_id: followerId,
                type: 'follow_request',
                title: 'Solicitação para seguir',
                message: `${followerName} quer te seguir.`,
                read: false,
                is_read: false,
                metadata: { follower_id: followerId, following_id: followingId },
              },
            ])
            notified = inserted?.ok === true && (inserted?.inserted || 0) > 0
          }

          return NextResponse.json({ ok: true, already: true, status: 'pending', resent: true, notified })
        }

        if (currentStatus === 'accepted') return NextResponse.json({ ok: true, already: true, status: 'accepted' })
        return NextResponse.json({ ok: true, already: true })
      }
      return NextResponse.json({ ok: false, error: msg || 'failed to follow' }, { status: 400 })
    }

    const { data: followerProfile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', followerId)
      .maybeSingle()

    const followerName = String(followerProfile?.display_name || '').trim() || 'Alguém'

    const recipients = await filterRecipientsByPreference([followingId], 'notifySocialFollows')
    let notified = false
    if (recipients.length) {
      try {
        await admin
          .from('notifications')
          .delete()
          .eq('user_id', followingId)
          .eq('type', 'follow_request')
          .eq('sender_id', followerId)
      } catch {}

      const inserted = await insertNotifications([
        {
          user_id: followingId,
          recipient_id: followingId,
          sender_id: followerId,
          type: 'follow_request',
          title: 'Solicitação para seguir',
          message: `${followerName} quer te seguir.`,
          read: false,
          is_read: false,
          metadata: { follower_id: followerId, following_id: followingId },
        },
      ])
      notified = inserted?.ok === true && (inserted?.inserted || 0) > 0
    }

    return NextResponse.json({ ok: true, notified })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

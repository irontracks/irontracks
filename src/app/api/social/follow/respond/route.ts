import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { insertNotifications } from '@/lib/social/notifyFollowers'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    follower_id: z.string().min(1),
    decision: z.enum(['accept', 'deny']),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:follow-respond:${auth.user.id}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { follower_id, decision } = parsedBody.data!

    const userId = String(auth.user.id || '').trim()
    const followerId = String(follower_id || '').trim()
    if (!followerId) return NextResponse.json({ ok: false, error: 'missing follower_id' }, { status: 400 })
    if (followerId === userId) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const admin = createAdminClient()

    if (decision === 'accept') {
      // Update the follow row to accepted
      const { error } = await admin
        .from('social_follows')
        .update({ status: 'accepted' })
        .eq('follower_id', followerId)
        .eq('following_id', userId)
        .eq('status', 'pending')

      if (error) {
        logError('api:social:follow:respond:accept', error)
        return NextResponse.json({ ok: false, error: String(error.message || 'Erro ao aceitar') }, { status: 500 })
      }

      // Mark follow_request notifications as read
      try {
        await admin
          .from('notifications')
          .update({ read: true })
          .eq('user_id', userId)
          .eq('type', 'follow_request')
          .eq('sender_id', followerId)
      } catch (e) { logError('api:social:follow:respond:mark-read', e) }

      // Notify the follower that their request was accepted
      try {
        const { data: profile } = await admin
          .from('profiles')
          .select('display_name')
          .eq('id', userId)
          .maybeSingle()
        const name = String(profile?.display_name || '').trim() || 'Alguém'

        await insertNotifications([
          {
            user_id: followerId,
            recipient_id: followerId,
            sender_id: userId,
            type: 'follow_accepted',
            title: 'Solicitação aceita',
            message: `${name} aceitou seu pedido para seguir.`,
            is_read: false,
            metadata: { follower_id: followerId, following_id: userId },
          },
        ])
      } catch (e) { logError('api:social:follow:respond:notify-accept', e) }

      return NextResponse.json({ ok: true, status: 'accepted' })
    } else {
      // Deny: delete the follow row
      const { error } = await admin
        .from('social_follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', userId)

      if (error) {
        logError('api:social:follow:respond:deny', error)
        return NextResponse.json({ ok: false, error: String(error.message || 'Erro ao recusar') }, { status: 500 })
      }

      // Mark follow_request notifications as read
      try {
        await admin
          .from('notifications')
          .update({ read: true })
          .eq('user_id', userId)
          .eq('type', 'follow_request')
          .eq('sender_id', followerId)
      } catch (e) { logError('api:social:follow:respond:mark-read-deny', e) }

      return NextResponse.json({ ok: true, status: 'denied' })
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

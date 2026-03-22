import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    following_id: z.string().min(1),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:follow-cancel:${auth.user.id}:${ip}`, 20, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { following_id } = parsedBody.data!

    const userId = String(auth.user.id || '').trim()
    const followingId = String(following_id || '').trim()
    if (!followingId) return NextResponse.json({ ok: false, error: 'missing following_id' }, { status: 400 })

    const admin = createAdminClient()

    // Check current status before deleting
    const { data: existing } = await admin
      .from('social_follows')
      .select('status')
      .eq('follower_id', userId)
      .eq('following_id', followingId)
      .maybeSingle()

    const currentStatus = String(existing?.status || '').trim().toLowerCase()
    const alreadyAccepted = currentStatus === 'accepted'

    // Delete the follow row
    const { error } = await admin
      .from('social_follows')
      .delete()
      .eq('follower_id', userId)
      .eq('following_id', followingId)

    if (error) {
      logError('api:social:follow:cancel', error)
      return NextResponse.json({ ok: false, error: String(error.message || 'Erro ao cancelar') }, { status: 500 })
    }

    // Clean up notifications
    try {
      await admin
        .from('notifications')
        .delete()
        .eq('user_id', followingId)
        .eq('type', 'follow_request')
        .eq('sender_id', userId)
    } catch (e) { logError('api:social:follow:cancel:cleanup-notif', e) }

    return NextResponse.json({ ok: true, already: alreadyAccepted, status: currentStatus || 'deleted' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

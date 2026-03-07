import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
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
      const { data: existing } = await auth.supabase
        .from('social_follows')
        .select('status')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle()
      const status = existing?.status === 'accepted' ? 'accepted' : existing?.status === 'pending' ? 'pending' : null
      return NextResponse.json({ ok: true, already: true, status })
    }

    const admin = createAdminClient()
    try {
      await admin
        .from('notifications')
        .delete()
        .eq('user_id', followingId)
        .eq('type', 'follow_request')
        .eq('sender_id', followerId)
        .eq('read', false)
    } catch {}

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

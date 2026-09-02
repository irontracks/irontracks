import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { logWarn } from '@/lib/logger'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, jsonError } from '@/utils/auth/route'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    student_user_id: z.string().min(1),
    content: z.string().min(1),
  })
  .strip()

export async function POST(req: Request) {
  const auth = await requireRole(['admin', 'teacher'])
  if (!auth.ok) return auth.response

  const ip = getRequestIp(req)
  const rl = await checkRateLimitAsync(`teacher:inbox:send:${auth.user.id}:${ip}`, 20, 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  try {
    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const studentUserId = parsedBody.data!.student_user_id.trim()
    const content = parsedBody.data!.content.trim()

    const requesterId = String(auth.user.id)
    const admin = createAdminClient()

    if (auth.role !== 'admin') {
      const { data: s } = await admin.from('students').select('id').eq('user_id', studentUserId).eq('teacher_id', requesterId).maybeSingle()
      if (!s?.id) return jsonError(403, 'forbidden')
    }

    const { data: channelId, error: chErr } = await auth.supabase.rpc('get_or_create_direct_channel', {
      user1: requesterId,
      user2: studentUserId,
    })
    if (chErr || !channelId) return respondDbError('api:teacher:inbox:send-message', chErr)

    const { error: msgErr } = await auth.supabase.from('direct_messages').insert({
      channel_id: channelId,
      sender_id: requesterId,
      content,
    })
    if (msgErr) return respondDbError('api:teacher:inbox:send-message', msgErr)

    try {
      await auth.supabase.from('direct_channels').update({ last_message_at: new Date().toISOString() }).eq('id', channelId)
    } catch (e) { logWarn('teacher:inbox:send-message', 'silenced', e) }

    return NextResponse.json({ ok: true, channel_id: channelId }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: unknown) {
    return respondInternalError('api:teacher:inbox:send-message', e)
  }
}

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, jsonError } from '@/utils/auth/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireRole(['admin', 'teacher'])
  if (!auth.ok) return auth.response

  try {
    const body: any = await req.json().catch(() => ({}))
    const studentUserId = String(body?.student_user_id || '').trim()
    const content = String(body?.content || '').trim()
    if (!studentUserId) return jsonError(400, 'student_user_id_required')
    if (!content) return jsonError(400, 'content_required')

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
    if (chErr || !channelId) return jsonError(400, chErr?.message || 'failed_channel')

    const { error: msgErr } = await auth.supabase.from('direct_messages').insert({
      channel_id: channelId,
      sender_id: requesterId,
      content,
    })
    if (msgErr) return jsonError(400, msgErr.message)

    try {
      await auth.supabase.from('direct_channels').update({ last_message_at: new Date().toISOString() }).eq('id', channelId)
    } catch {}

    return NextResponse.json({ ok: true, channel_id: channelId }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: any) {
    return jsonError(500, e?.message ?? String(e))
  }
}


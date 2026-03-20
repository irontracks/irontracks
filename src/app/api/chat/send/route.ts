import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPushToAllPlatforms as sendPushToUsers } from '@/lib/push/sender'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    channel_id: z.string().min(1),
    content: z.string().min(1).max(4000),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`chat:send:${user.id}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { channel_id, content } = parsedBody.data!

    // Verify the user is a member of this channel before allowing send
    const { data: membership } = await supabase
      .from('chat_members')
      .select('id')
      .eq('channel_id', channel_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership?.id) {
      // Fallback: check if this is the global channel (no membership required)
      const { data: channel } = await supabase
        .from('chat_channels')
        .select('type')
        .eq('id', channel_id)
        .maybeSingle()
      if (String(channel?.type || '') !== 'global') {
        return NextResponse.json({ ok: false, error: 'not_member' }, { status: 403 })
      }
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ channel_id, user_id: user.id, content })
      .select('id, channel_id, sender_id, content, created_at, media_url, media_type, reply_to')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    // Fire push to other channel members
    try {
      const admin = createAdminClient()

      // Try chat_members first (works for private DMs)
      const { data: members } = await admin
        .from('chat_members')
        .select('user_id')
        .eq('channel_id', channel_id)
        .neq('user_id', user.id)
        .limit(100)
      let recipientIds = (Array.isArray(members) ? members : [])
        .map(m => String(m?.user_id || '').trim())
        .filter(Boolean)

      // Fallback for global channels: query recent unique message senders
      if (!recipientIds.length) {
        const { data: recentMsgs } = await admin
          .from('messages')
          .select('user_id')
          .eq('channel_id', channel_id)
          .neq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(200)
        const uniqueIds = new Set<string>()
          ; (Array.isArray(recentMsgs) ? recentMsgs : []).forEach(m => {
            const uid = String(m?.user_id || '').trim()
            if (uid) uniqueIds.add(uid)
          })
        recipientIds = Array.from(uniqueIds)
        // Don't spam too many people for global chat
        if (recipientIds.length > 50) recipientIds = []
      }

      if (recipientIds.length) {
        const { data: me } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
        const senderName = String(me?.display_name || '').trim() || 'Alguém'
        const preview = content.length > 100 ? content.slice(0, 100) + '…' : content
        void sendPushToUsers(recipientIds, `💬 ${senderName}`, preview).catch(() => { })
      }
    } catch { }

    return NextResponse.json({ ok: true, message: data })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) }, { status: 500 })
  }
}

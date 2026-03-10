import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPushToUsers } from '@/lib/push/apns'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    sessionId: z.string().min(1),
    senderId: z.string().min(1),
    senderName: z.string().min(1),
    preview: z.string().min(1).max(200),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req)

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { sessionId, senderId, senderName, preview } = parsedBody.data!

    // Rate-limit: max 1 push burst per sender per session per 30s
    // This prevents spam during active workout sessions
    const rl = await checkRateLimitAsync(`team:chat:push:${sessionId}:${senderId}:${ip}`, 2, 30_000)
    if (!rl.allowed) return NextResponse.json({ ok: true, skipped: 'rate_limited' })

    const admin = createAdminClient()

    // Fetch session participants
    const { data: session, error } = await admin
      .from('team_sessions')
      .select('participants')
      .eq('id', sessionId)
      .maybeSingle()

    if (error || !session) return NextResponse.json({ ok: false, error: 'session_not_found' }, { status: 404 })

    const participants = Array.isArray(session.participants) ? session.participants : []

    // Collect recipient user IDs (everyone except the sender)
    const recipientIds = participants
      .map((p: unknown) => {
        const pObj = p && typeof p === 'object' ? (p as Record<string, unknown>) : null
        return String(pObj?.uid || pObj?.user_id || pObj?.id || '').trim()
      })
      .filter((uid) => uid && uid !== senderId)

    if (!recipientIds.length) return NextResponse.json({ ok: true, sent: 0 })

    const safeName = senderName.slice(0, 80)
    const safePreview = preview.slice(0, 100)

    void sendPushToUsers(recipientIds, `💬 ${safeName}`, safePreview).catch(() => { })

    return NextResponse.json({ ok: true, sent: recipientIds.length })
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) },
      { status: 500 }
    )
  }
}

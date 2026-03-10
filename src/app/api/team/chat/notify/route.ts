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
    // Full message payload for server-side broadcast relay
    msgId: z.string().optional(),
    msgDisplayName: z.string().optional(),
    msgPhotoURL: z.string().nullable().optional(),
    msgTs: z.number().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req)

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { sessionId, senderId, senderName, preview, msgId, msgDisplayName, msgPhotoURL, msgTs } = parsedBody.data!

    const admin = createAdminClient()

    // ─── 1. Server-side broadcast relay (reliable delivery) ─────────────
    // Re-broadcasts the chat message from the server to ensure all
    // connected clients receive it, even if the sender's client broadcast
    // was dropped due to WebSocket instability.
    try {
      const ch = admin.channel(`team_logs:${sessionId}`)
      await ch.send({
        type: 'broadcast',
        event: 'chat',
        payload: {
          id: msgId || `${senderId}:${Date.now()}`,
          userId: senderId,
          displayName: msgDisplayName || senderName,
          photoURL: msgPhotoURL ?? null,
          text: preview,
          ts: msgTs || Date.now(),
          relay: true, // marks this as server relay (for dedup)
        },
      })
      // Clean up the channel immediately
      admin.removeChannel(ch)
    } catch { }

    // ─── 2. Push notification (rate-limited) ────────────────────────────
    const rl = await checkRateLimitAsync(`team:chat:push:${sessionId}:${senderId}:${ip}`, 2, 30_000)
    if (rl.allowed) {
      // Fetch session participants for push
      const { data: session } = await admin
        .from('team_sessions')
        .select('participants')
        .eq('id', sessionId)
        .maybeSingle()

      const participants = Array.isArray(session?.participants) ? session.participants : []
      const recipientIds = participants
        .map((p: unknown) => {
          const pObj = p && typeof p === 'object' ? (p as Record<string, unknown>) : null
          return String(pObj?.uid || pObj?.user_id || pObj?.id || '').trim()
        })
        .filter((uid) => uid && uid !== senderId)

      if (recipientIds.length) {
        const safeName = senderName.slice(0, 80)
        const safePreview = preview.slice(0, 100)
        void sendPushToUsers(recipientIds, `💬 ${safeName}`, safePreview).catch(() => { })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) },
      { status: 500 }
    )
  }
}

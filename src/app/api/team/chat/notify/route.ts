import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPushToUsers } from '@/lib/push/apns'
import { logInfo, logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    sessionId: z.string().min(1),
    senderId: z.string().min(1),
    senderName: z.string().min(1),
    text: z.string().min(1).max(200),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req)

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { sessionId, senderId, senderName, text } = parsedBody.data!

    const admin = createAdminClient()

    // ─── 1. Persist message to `messages` table (reliable delivery via postgres_changes) ──
    // Uses session_id as channel_id so clients can subscribe to postgres_changes
    const { data: inserted, error: insertErr } = await admin
      .from('messages')
      .insert({
        channel_id: sessionId,
        user_id: senderId,
        content: text,
      })
      .select('id, created_at')
      .single()

    if (insertErr) {
      logError('team-chat', '[TeamChat] Failed to insert message', insertErr)
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
    }

    logInfo('team-chat', `[TeamChat] Message persisted: ${inserted.id}`)

    // ─── 2. Push notification (rate-limited) ────────────────────────────
    const rl = await checkRateLimitAsync(`team:chat:push:${sessionId}:${senderId}:${ip}`, 2, 30_000)
    if (rl.allowed) {
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
        void sendPushToUsers(recipientIds, `💬 ${senderName.slice(0, 80)}`, text.slice(0, 100)).catch(() => { })
      }
    }

    return NextResponse.json({ ok: true, id: inserted.id })
  } catch (e: unknown) {
    logError('team-chat', '[TeamChat] Unexpected error', e)
    return NextResponse.json(
      { ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) },
      { status: 500 }
    )
  }
}

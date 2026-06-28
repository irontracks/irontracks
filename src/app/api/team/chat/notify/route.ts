import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPushToAllPlatforms as sendPushToUsers } from '@/lib/push/sender'
import { logInfo, logError } from '@/lib/logger'
import { requireUser } from '@/utils/auth/route'
import { isTeamSessionMember } from '@/utils/team/sessionMembership'
import { waitUntil } from '@vercel/functions'
import { extractMentions } from '@/lib/social/extractMentions'
import { insertNotifications } from '@/lib/social/notifyFollowers'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    sessionId: z.string().min(1),
    senderId: z.string().min(1),
    senderName: z.string().min(1),
    senderPhoto: z.string().nullable().optional(),
    text: z.string().min(1).max(200),
  })
  .strip()

export async function POST(req: Request) {
  try {
    // Auth: require authenticated user
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { sessionId, senderId, senderName, senderPhoto, text } = parsedBody.data!

    // Validate senderId matches authenticated user — prevents impersonation
    if (senderId !== auth.user.id) {
      return NextResponse.json({ ok: false, error: 'sender_mismatch' }, { status: 403 })
    }

    const admin = createAdminClient()

    // Authz: só membros da sessão (host / participante / presença) podem postar.
    // Antes, qualquer usuário autenticado inseria mensagem em sessão alheia e
    // disparava push spam para os membros (write-IDOR — auditoria 2026-06-27).
    if (!(await isTeamSessionMember(admin, sessionId, auth.user.id))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    // ─── 1. Persist to dedicated team_chat_messages table ──────────────
    const { data: inserted, error: insertErr } = await admin
      .from('team_chat_messages')
      .insert({
        session_id: sessionId,
        user_id: senderId,
        display_name: senderName,
        photo_url: senderPhoto ?? null,
        content: text,
      })
      .select('id, created_at')
      .single()

    if (insertErr) {
      logError('team-chat', '[TeamChat] INSERT failed', insertErr)
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
    }

    logInfo('team-chat', `[TeamChat] Persisted msg ${inserted.id} in session ${sessionId}`)

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
        // Team chat uses the notifyTeamInvites pref as a proxy for "team
        // interaction pushes" — no separate toggle for chat-only pushes.
        waitUntil(
          sendPushToUsers(
            recipientIds,
            `💬 ${senderName.slice(0, 80)}`,
            text.slice(0, 100),
            { type: 'team_chat' },
            { preferenceKey: 'notifyTeamInvites' },
          ).catch(() => { })
        )
      }
    }

    // ─── 3. @mention notifications (separate from chat broadcast) ──────
    waitUntil(
      (async () => {
        try {
          const mentions = await extractMentions(text)
          const mentionedIds = Object.values(mentions.userIdsByHandle).filter(
            (id) => id && id !== senderId,
          )
          if (!mentionedIds.length) return

          const preview = text.length > 80 ? `${text.slice(0, 77)}…` : text
          await insertNotifications(
            mentionedIds.map((mid) => ({
              user_id: mid,
              recipient_id: mid,
              sender_id: senderId,
              type: 'mentioned_in_chat',
              title: 'Você foi mencionado',
              message: `${senderName} te mencionou: ${preview}`,
              is_read: false,
              metadata: { session_id: sessionId, message_id: inserted.id, sender_id: senderId },
            })),
          )
        } catch (e) {
          logError('team-chat.mention', e)
        }
      })(),
    )

    return NextResponse.json({ ok: true, id: inserted.id })
  } catch (e: unknown) {
    logError('team-chat', '[TeamChat] Unexpected error', e)
    return NextResponse.json(
      { ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) },
      { status: 500 }
    )
  }
}

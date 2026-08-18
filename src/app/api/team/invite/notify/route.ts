/**
 * POST /api/team/invite/notify
 *
 * Fires a push notification to a user that has just received a team-workout
 * invite. The invite row itself is still inserted client-side by
 * useTeamInvites.sendInvite — this endpoint only handles the lock-screen push,
 * which cannot happen client-side (no FCM/APNs credentials in the browser).
 *
 * The server validates:
 *   1. The caller (auth'd user) is the same as the invite's from_uid.
 *   2. The invite actually exists and matches target_user_id.
 *   3. The recipient hasn't disabled team-invite pushes in settings.
 *
 * Rate-limited to prevent invite-spam: 5 pushes per 60s per sender.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendPushToAllPlatforms } from '@/lib/push/sender'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { waitUntil } from '@vercel/functions'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    targetUserId: z.string().min(1),
    workoutTitle: z.string().min(1).max(120).optional(),
    sessionId: z.string().min(1).optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const senderId = String(auth.user.id || '').trim()
    if (!senderId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { targetUserId, workoutTitle, sessionId } = parsed.data!

    if (targetUserId === senderId) {
      return NextResponse.json({ ok: true, skipped: 'self' })
    }

    const rl = await checkRateLimitAsync(`team:invite:notify:${senderId}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const admin = createAdminClient()

    // Validação prometida no docstring (#2): só dispara o push se existir um
    // convite PENDENTE real deste sender para o targetUserId. Antes, qualquer
    // autenticado disparava "Convite de treino" (com o próprio nome real) para
    // qualquer user_id — spam/phishing direcionado (auditoria 2026-06-27).
    let inviteQuery = admin
      .from('invites')
      .select('id')
      .eq('from_uid', senderId)
      .eq('to_uid', targetUserId)
      .eq('status', 'pending')
    if (sessionId) inviteQuery = inviteQuery.eq('team_session_id', sessionId)
    const { data: invite } = await inviteQuery.maybeSingle()
    if (!invite?.id) {
      return NextResponse.json({ ok: false, error: 'invite_not_found' }, { status: 404 })
    }

    // Fetch the sender's display name for the push body
    const { data: me } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', senderId)
      .maybeSingle()
    const senderName = String(me?.display_name || '').trim() || 'Um amigo'

    const title = `Convite de treino`
    const workout = String(workoutTitle || 'Treino').trim().slice(0, 80)
    const body = `${senderName} chamou voc\u00ea para treinar: ${workout}`

    const extra: Record<string, string> = {
      type: 'team_invite',
      link: '/',
    }
    if (sessionId) extra.sessionId = sessionId

    // Filter by preference: allowTeamInvites is the "accept invites at all"
    // master; pushTeamInvites is the "do I want the push" specific pref.
    // sendPushToAllPlatforms enforces the master switch; we pass the per-type
    // key so the caller only needs one call.
    waitUntil(
      sendPushToAllPlatforms([targetUserId], title, body, extra, {
        preferenceKey: 'notifyTeamInvites',
      }).catch(() => { })
    )

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import {
  filterRecipientsByPreference,
  insertNotifications,
  listFollowerIdsOf,
  shouldThrottleBySenderType,
} from '@/lib/social/notifyFollowers'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    workout_id: z.string().optional(),
    workout_title: z.string().optional(),
    title: z.string().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`social:workout-start:${auth.user.id}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const workoutId = String(body?.workout_id || '').trim() || null
    const workoutTitle = String(body?.workout_title || body?.title || '').trim() || 'Treino'

    const userId = String(auth.user.id || '').trim()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const throttled = await shouldThrottleBySenderType(userId, 'workout_start', 3)
    if (throttled) return NextResponse.json({ ok: true, throttled: true })

    const admin = createAdminClient()
    const { data: me } = await admin.from('profiles').select('display_name').eq('id', userId).maybeSingle()
    const name = String(me?.display_name || '').trim() || 'Seu amigo'

    const followerIds = await listFollowerIdsOf(userId)
    // Chave certa é 'notifyFriendWorkoutStart' (ver NOTIFICATION_TYPE_TO_PREFERENCE em
    // notifyFollowers.ts) — 'notifyFriendWorkoutEvents' é a de workout_finish. Usar a
    // errada aqui filtrava por uma preferência que não é a do tipo 'workout_start'.
    const recipients = await filterRecipientsByPreference(followerIds, 'notifyFriendWorkoutStart')
    if (!recipients.length) {
      // Instrumentação temporária: investigando por que followers ativos (com a
      // preferência ligada) não recebem este evento no feed social. Se followerIds
      // já vier vazio ou a filtragem por preferência zerar uma lista não-vazia,
      // queremos ver isso no Sentry na próxima ocorrência real.
      if (followerIds.length > 0) {
        logError('social:workout-start', new Error(`followers existem (${followerIds.length}) mas nenhum recipient passou o filtro de preferência p/ user ${userId}`), { followerIds })
      }
      return NextResponse.json({ ok: true, sent: 0 })
    }

    const rows = recipients.map((rid) => ({
      user_id: rid,
      recipient_id: rid,
      sender_id: userId,
      type: 'workout_start',
      title: 'Treino iniciado',
      message: `${name} começou um treino: ${workoutTitle}.`,
      is_read: false,
      metadata: { workout_id: workoutId, workout_title: workoutTitle, sender_id: userId },
    }))

    const res = await insertNotifications(rows)
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error || 'failed' }, { status: 400 })

    return NextResponse.json({ ok: true, sent: res.inserted })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

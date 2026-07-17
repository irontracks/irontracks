import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { sendPushToAllPlatforms as sendPushToUsers } from '@/lib/push/sender'
import { waitUntil } from '@vercel/functions'
import { respondDbError } from '@/utils/api/dbError'
import { canCoachStudent } from '@/utils/auth/studentAccess'

export const dynamic = 'force-dynamic'

// `studentUserId` é o AUTH UID do aluno (== students.user_id) — o mesmo que o painel
// já tem em selectedStudent.user_id e que canCoachStudent valida. `workoutName` é só
// pra compor a mensagem; se ausente, a mensagem fica genérica.
const ZodBodySchema = z
  .object({
    studentUserId: z.string().min(1),
    workoutName: z.string().max(120).optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const user = auth.user

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const studentUserId = body.studentUserId as string
    const workoutName = (body.workoutName as string | undefined)?.trim() || ''

    // Fail-closed: só o professor DESTE aluno (ou admin) pode notificar.
    const allowed = await canCoachStudent({ id: user.id, email: user.email }, studentUserId)
    if (!allowed) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const title = 'Treino novo do seu professor 💪'
    const message = workoutName
      ? `Seu professor montou "${workoutName}" pra você. Bora treinar!`
      : 'Seu professor montou um treino novo pra você. Bora treinar!'
    const type = 'workout_assigned'

    const admin = createAdminClient()
    const { data: prefRow } = await admin
      .from('user_settings')
      .select('preferences')
      .eq('user_id', studentUserId)
      .maybeSingle()

    const prefs = prefRow?.preferences && typeof prefRow.preferences === 'object' ? prefRow.preferences : null
    const allow = prefs ? (prefs as Record<string, unknown>).notifyWorkoutAssigned !== false : true
    if (!allow) return NextResponse.json({ ok: true, notified: false })

    const { error: insertError } = await admin.from('notifications').insert({
      user_id: studentUserId,
      title,
      message,
      type,
      is_read: false,
      read: false,
    })

    if (insertError) {
      return respondDbError('notifications:workout-assigned:insert', insertError)
    }

    // Push (o sender aplica o filtro de preferência + quiet hours). O `link` leva o tap
    // pra lista de treinos do aluno (view 'dashboard'); o branch está em usePushNotifications.
    waitUntil(
      sendPushToUsers(
        [studentUserId],
        title,
        message,
        { type, link: '/dashboard' },
        { preferenceKey: 'notifyWorkoutAssigned' },
      ).catch(() => { })
    )

    return NextResponse.json({ ok: true, notified: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}

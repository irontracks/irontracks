import { NextResponse } from 'next/server'
import { logWarn } from '@/lib/logger'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { requireRoleOrBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { deleteTemplateFromSubscribers } from '@/lib/workoutSync'
import { getErrorMessage } from '@/utils/errorMessage'
import { respondDbError } from '@/utils/api/dbError'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireRoleOrBearer(req, ['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const admin = createAdminClient()
    const role = auth.role
    const requesterId = auth.user.id

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body: Record<string, unknown> = parsedBody.data!
    const id = String(body?.id || '').trim()
    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const { data: w, error: wErr } = await admin
      .from('workouts')
      .select('id, is_template, user_id, created_by')
      .eq('id', id)
      .maybeSingle()
    if (wErr) return respondDbError('admin:workouts:delete:fetch', wErr)
    if (!w?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (w?.is_template !== true) return NextResponse.json({ ok: false, error: 'refuse_non_template' }, { status: 400 })

    if (role !== 'admin') {
      const ownsOrCreated =
        String(w?.user_id || '') === requesterId || String(w?.created_by || '') === requesterId
      if (!ownsOrCreated) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data: exs, error: exErr } = await admin.from('exercises').select('id').eq('workout_id', id)
    if (exErr) return respondDbError('admin:workouts:delete:exercises', exErr)
    const exIds = (exs || []).map((e: unknown) => (e as Record<string, unknown>)?.id).filter(Boolean)
    if (exIds.length) {
      const { error: setsErr } = await admin.from('sets').delete().in('exercise_id', exIds)
      if (setsErr) return respondDbError('admin:workouts:delete:sets', setsErr)
    }
    const { error: exDelErr } = await admin.from('exercises').delete().eq('workout_id', id)
    if (exDelErr) return respondDbError('admin:workouts:delete:exercises-del', exDelErr)

    const { error } = await admin.from('workouts').delete().eq('id', id)
    if (error) return respondDbError('admin:workouts:delete', error)

    try {
      if (String(w?.user_id || '') === requesterId) {
        await deleteTemplateFromSubscribers({ sourceUserId: requesterId, sourceWorkoutId: id })
      }
    } catch (e) { logWarn('admin:workouts:delete', 'silenced', e) }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

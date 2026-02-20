import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { deleteTemplateFromSubscribers } from '@/lib/workoutSync'
import { parseJsonBody } from '@/utils/zod'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
    confirm: z.boolean(),
    reason: z.string().min(1),
  })
  .strip()

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const id = String(body?.id || '').trim()
    const confirm = body?.confirm === true
    const reason = String(body?.reason || '').trim()

    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    if (!confirm || !reason) return NextResponse.json({ ok: false, error: 'confirm_required' }, { status: 400 })

    const admin = createAdminClient()

    const { data: w, error: wErr } = await admin
      .from('workouts')
      .select('id, user_id, created_by, is_template')
      .eq('id', id)
      .maybeSingle()
    if (wErr) return NextResponse.json({ ok: false, error: wErr.message }, { status: 400 })
    if (!w?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const { data: exs, error: exErr } = await admin.from('exercises').select('id').eq('workout_id', id)
    if (exErr) return NextResponse.json({ ok: false, error: exErr.message }, { status: 400 })
    const exIds = (exs || []).map((e: any) => e?.id).filter(Boolean)
    if (exIds.length) {
      const { error: setsErr } = await admin.from('sets').delete().in('exercise_id', exIds)
      if (setsErr) return NextResponse.json({ ok: false, error: setsErr.message }, { status: 400 })
    }
    const { error: exDelErr } = await admin.from('exercises').delete().eq('workout_id', id)
    if (exDelErr) return NextResponse.json({ ok: false, error: exDelErr.message }, { status: 400 })

    const { error: delErr } = await admin.from('workouts').delete().eq('id', id)
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 })

    try {
      const isSourceTemplate = w?.is_template === true && String(w?.user_id || '') === String(w?.created_by || '')
      if (isSourceTemplate) {
        await deleteTemplateFromSubscribers({ sourceUserId: String(w.user_id), sourceWorkoutId: id })
      }
    } catch {}

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

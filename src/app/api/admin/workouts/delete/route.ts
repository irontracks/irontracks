import { NextResponse } from 'next/server'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { deleteTemplateFromSubscribers } from '@/lib/workoutSync'

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) return auth.response
    }
    const admin = createAdminClient()
    const role = auth.role
    const requesterId = auth.user.id

    const body = await req.json()
    const { id } = body || {}
    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const { data: w, error: wErr } = await admin
      .from('workouts')
      .select('id, is_template, user_id, created_by')
      .eq('id', id)
      .maybeSingle()
    if (wErr) return NextResponse.json({ ok: false, error: wErr.message }, { status: 400 })
    if (!w?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (w?.is_template !== true) return NextResponse.json({ ok: false, error: 'refuse_non_template' }, { status: 400 })

    if (role !== 'admin') {
      const ownsOrCreated =
        String(w?.user_id || '') === requesterId || String(w?.created_by || '') === requesterId
      if (!ownsOrCreated) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data: exs, error: exErr } = await admin.from('exercises').select('id').eq('workout_id', id)
    if (exErr) return NextResponse.json({ ok: false, error: exErr.message }, { status: 400 })
    const exIds = (exs || []).map((e: any) => e.id).filter(Boolean)
    if (exIds.length) {
      const { error: setsErr } = await admin.from('sets').delete().in('exercise_id', exIds)
      if (setsErr) return NextResponse.json({ ok: false, error: setsErr.message }, { status: 400 })
    }
    const { error: exDelErr } = await admin.from('exercises').delete().eq('workout_id', id)
    if (exDelErr) return NextResponse.json({ ok: false, error: exDelErr.message }, { status: 400 })

    const { error } = await admin.from('workouts').delete().eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    try {
      if (String(w?.user_id || '') === requesterId) {
        await deleteTemplateFromSubscribers({ sourceUserId: requesterId, sourceWorkoutId: id })
      }
    } catch {}
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

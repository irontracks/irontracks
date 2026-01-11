import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const admin = createAdminClient()

    const body = await req.json()
    const { id } = body || {}
    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const { data: w } = await admin.from('workouts').select('id, is_template').eq('id', id).maybeSingle()
    if (!w?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (w?.is_template !== true) return NextResponse.json({ ok: false, error: 'refuse_non_template' }, { status: 400 })

    const { data: exs } = await admin.from('exercises').select('id').eq('workout_id', id)
    const exIds = (exs || []).map((e) => e.id)
    if (exIds.length > 0) {
      await admin.from('sets').delete().in('exercise_id', exIds)
    }
    await admin.from('exercises').delete().eq('workout_id', id)
    const { error } = await admin.from('workouts').delete().eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

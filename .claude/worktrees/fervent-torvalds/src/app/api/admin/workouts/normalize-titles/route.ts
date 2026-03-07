import { NextResponse } from 'next/server'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeWorkoutTitle } from '@/utils/workoutTitle'

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) return auth.response
    }

    const admin = createAdminClient()
    const uid = String(auth.user.id || '').trim()
    if (!uid) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: rows, error } = await admin
      .from('workouts')
      .select('id, name')
      .eq('user_id', uid)
      .eq('is_template', true)
      .limit(2000)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const updates = (rows || [])
      .map((r: any) => {
        const current = String(r?.name || '')
        const next = normalizeWorkoutTitle(current)
        if (!r?.id || !next || next === current) return null
        return { id: r.id, name: next }
      })
      .filter(Boolean)

    if (!updates.length) return NextResponse.json({ ok: true, updated: 0 })

    const { error: upErr } = await admin.from('workouts').upsert(updates, { onConflict: 'id' })
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, updated: updates.length })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

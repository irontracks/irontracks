import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) return auth.response
    }

    const body = await req.json()
    const { id, status } = body || {}
    if (!id || !status) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    // Only admin or responsible teacher
    const admin = createAdminClient()
    if (auth.role !== 'admin') {
      const { data: s } = await admin.from('students').select('teacher_id').eq('id', id).maybeSingle()
      if (!s || s.teacher_id !== auth.user.id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { error } = await admin.from('students').update({ status }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

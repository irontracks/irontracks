import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const url = new URL(req.url)
    const teacher_user_id = String(url.searchParams.get('teacher_user_id') || '').trim()
    if (!teacher_user_id) return NextResponse.json({ ok: false, error: 'missing teacher_user_id' }, { status: 400 })

    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('students')
      .select('id, user_id, name, email, status, created_at, teacher_id')
      .eq('teacher_id', teacher_user_id)
      .order('name')
      .limit(2000)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, students: rows || [] }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

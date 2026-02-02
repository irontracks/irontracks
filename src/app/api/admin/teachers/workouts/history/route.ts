import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const clamp = (n: number, min: number, max: number) => {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export async function GET(req: Request) {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response

    const url = new URL(req.url)
    const teacher_user_id = String(url.searchParams.get('teacher_user_id') || '').trim()
    const limit = clamp(Number(url.searchParams.get('limit') || 80), 1, 200)
    const cursorDate = String(url.searchParams.get('cursor_date') || '').trim()
    const cursorCreatedAt = String(url.searchParams.get('cursor_created_at') || '').trim()
    if (!teacher_user_id) return NextResponse.json({ ok: false, error: 'missing teacher_user_id' }, { status: 400 })

    const admin = createAdminClient()
    const { data: students, error: stErr } = await admin
      .from('students')
      .select('user_id, name')
      .eq('teacher_id', teacher_user_id)
      .limit(5000)
    if (stErr) return NextResponse.json({ ok: false, error: stErr.message }, { status: 400 })

    const studentUserIds = (students || []).map((s: any) => String(s?.user_id || '').trim()).filter(Boolean)
    if (studentUserIds.length === 0) return NextResponse.json({ ok: true, rows: [], next_cursor: null })

    const studentNameById = new Map<string, string>()
    for (const s of students || []) {
      const uid = String((s as any)?.user_id || '').trim()
      if (!uid) continue
      const nm = String((s as any)?.name || '').trim()
      if (nm) studentNameById.set(uid, nm)
    }

    let q = admin
      .from('workouts')
      .select('id, user_id, name, date, created_at, updated_at, is_template')
      .in('user_id', studentUserIds)
      .eq('is_template', false)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursorDate) q = q.lt('date', cursorDate)
    if (cursorCreatedAt) q = q.lt('created_at', cursorCreatedAt)

    const { data: rows, error } = await q
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const enriched = (rows || []).map((w: any) => ({
      ...w,
      student_name: studentNameById.get(String(w?.user_id || '').trim()) || null,
    }))

    const last = enriched.length ? enriched[enriched.length - 1] : null
    const next_cursor = last?.date || last?.created_at ? { cursor_date: last?.date || null, cursor_created_at: last?.created_at || null } : null

    return NextResponse.json({ ok: true, rows: enriched, next_cursor }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


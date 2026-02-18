import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const clamp = (n: number, min: number, max: number) => {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

const QuerySchema = z.object({
  teacher_id: z.string().uuid('teacher_id inválido').optional(),
  teacher_user_id: z.string().uuid('teacher_user_id inválido').optional(),
  limit: z.coerce.number().int().min(1).max(200).default(80),
  cursor: z.string().optional(),
})

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

    const teacherId = (q.teacher_id ?? q.teacher_user_id)?.trim()
    if (!teacherId) {
      return NextResponse.json({ ok: false, error: 'missing teacher_id' }, { status: 400 })
    }

    const limit = clamp(q.limit, 1, 200)
    const cursor = String(q.cursor ?? '').trim()

    const admin = createAdminClient()
    const { data: students, error: stErr } = await admin
      .from('students')
      .select('user_id, name')
      .eq('teacher_id', teacherId)
      .limit(5000)
    if (stErr) return NextResponse.json({ ok: false, error: stErr.message }, { status: 400 })

    const studentUserIds = (students || []).map((s: any) => String(s?.user_id || '').trim()).filter(Boolean)
    if (studentUserIds.length === 0) return NextResponse.json({ ok: true, rows: [], next_cursor: null })

    const studentNameById = new Map<string, string>()
    for (const s of students || []) {
      const uid = String((s as Record<string, unknown>)?.user_id || '').trim()
      if (!uid) continue
      const nm = String((s as Record<string, unknown>)?.name || '').trim()
      if (nm) studentNameById.set(uid, nm)
    }

    let q = admin
      .from('workouts')
      .select('id, user_id, name, date, created_at, updated_at, is_template')
      .in('user_id', studentUserIds)
      .eq('is_template', true)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) q = q.lt('created_at', cursor)

    const { data: rows, error } = await q
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const enriched = (rows || []).map((w: any) => ({
      ...w,
      student_name: studentNameById.get(String(w?.user_id || '').trim()) || null,
    }))

    const last = enriched.length ? enriched[enriched.length - 1] : null
    const next_cursor = last?.created_at ? String(last.created_at) : null

    return NextResponse.json({ ok: true, rows: enriched, next_cursor }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

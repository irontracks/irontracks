import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  teacher_id: z.string().uuid('teacher_id inválido').optional(),
  teacher_user_id: z.string().uuid('teacher_user_id inválido').optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(200),
  offset: z.coerce.number().int().min(0).default(0),
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

    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('students')
      .select('id, user_id, name, email, status, created_at, teacher_id')
      .eq('teacher_id', teacherId)
      .order('name')
      .range(q.offset, q.offset + q.limit - 1)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, students: rows || [] }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
  })
  .strip()

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) return auth.response
    }

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body: any = parsedBody.data!
    const id = String(body?.id || '').trim()
    const status = String(body?.status || '').trim()
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
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'

const ZodBodySchema = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
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
    const { id, status } = parsedBody.data!
    if (!id || !status) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    const admin = createAdminClient()
    const { error } = await admin.from('teachers').update({ status }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

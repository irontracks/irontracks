import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    email: z.string().min(1),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body: any = parsedBody.data!
    const email = String(body?.email || '').toLowerCase().trim()
    if (!email) return NextResponse.json({ ok: false, error: 'missing email' }, { status: 400 })

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('id, display_name, role')
      .ilike('email', email)
      .maybeSingle()

    if (!profile?.id) return NextResponse.json({ ok: false, error: 'profile not found' }, { status: 404 })

    // Update role to teacher
    await admin.from('profiles').update({ role: 'teacher' }).eq('id', profile.id)

    let teacherRow: any | null = null
    const { data: existingByUser } = await admin
      .from('teachers')
      .select('id')
      .eq('user_id', profile.id)
      .maybeSingle()
    teacherRow = existingByUser || null

    if (!teacherRow) {
      const { data: existingByEmail } = await admin
        .from('teachers')
        .select('id')
        .ilike('email', email)
        .maybeSingle()
      teacherRow = existingByEmail || null
    }

    if (teacherRow?.id) {
      const { error: updateErr } = await admin
        .from('teachers')
        .update({
          user_id: profile.id,
          email,
          name: profile.display_name || email,
          status: 'active',
        })
        .eq('id', teacherRow.id)
      if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 })
    } else {
      const { error: insertErr } = await admin
        .from('teachers')
        .insert({
          user_id: profile.id,
          email,
          name: profile.display_name || email,
          status: 'active',
        })
      if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

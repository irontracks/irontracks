import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const looksLikeUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

const QuerySchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email().optional(),
})

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) return auth.response
    }

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response
    if (!q) return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 })

    const { id, email } = q

    const supabase = auth.supabase

    let targetUserId = ''
    if (id) {
      const { data: sById } = await supabase.from('students').select('user_id, email').eq('id', id).maybeSingle()
      targetUserId = sById?.user_id || ''
      if (!targetUserId) {
        const { data: pById } = await supabase.from('profiles').select('id').eq('id', id).maybeSingle()
        targetUserId = pById?.id || ''
      }
    }

    if (!targetUserId && email) {
      const { data: pByEmail } = await supabase.from('profiles').select('id').ilike('email', email).maybeSingle()
      targetUserId = pByEmail?.id || ''
      if (!targetUserId) {
        const { data: sByEmail } = await supabase.from('students').select('user_id').ilike('email', email).maybeSingle()
        targetUserId = sByEmail?.user_id || ''
      }
    }

    if (!targetUserId) return NextResponse.json({ ok: false, error: 'missing target' }, { status: 400 })
    if (!looksLikeUuid(targetUserId)) return NextResponse.json({ ok: false, error: 'invalid target' }, { status: 400 })

    if (auth.role === 'teacher') {
      const { data: links } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('teacher_id', auth.user.id)
        .limit(1)
      const link = Array.isArray(links) ? links[0] : null
      if (!link?.id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data: rows } = await supabase
      .from('workouts')
      .select('*')
      .eq('is_template', false)
      .eq('user_id', targetUserId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    return NextResponse.json({ ok: true, rows: rows || [] })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

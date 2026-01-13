import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const looksLikeUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export async function GET(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response

    const url = new URL(req.url)
    const id = url.searchParams.get('id') || undefined
    const email = url.searchParams.get('email') || undefined

    const admin = createAdminClient()

    let targetUserId = ''
    if (id) {
      const { data: sById } = await admin.from('students').select('user_id').eq('id', id).maybeSingle()
      targetUserId = sById?.user_id || ''
      if (!targetUserId) {
        const { data: pById } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
        targetUserId = pById?.id || ''
      }
    }

    if (!targetUserId && email) {
      const { data: pByEmail } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
      targetUserId = pByEmail?.id || ''
      if (!targetUserId) {
        const { data: sByEmail } = await admin.from('students').select('user_id').ilike('email', email).maybeSingle()
        targetUserId = sByEmail?.user_id || ''
      }
    }

    if (!targetUserId) return NextResponse.json({ ok: false, error: 'missing target' }, { status: 400 })
    if (!looksLikeUuid(targetUserId)) return NextResponse.json({ ok: false, error: 'invalid target' }, { status: 400 })

    const { data: rows } = await admin
      .from('workouts')
      .select('*')
      .eq('is_template', false)
      .eq('user_id', targetUserId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)

    return NextResponse.json({ ok: true, rows: rows || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

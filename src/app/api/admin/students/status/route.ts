import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json()
    const { id, status } = body || {}
    if (!id || !status) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    // Only admin or responsible teacher
    const admin = createAdminClient()
    if (user.email !== ADMIN_EMAIL) {
      const { data: s } = await admin.from('students').select('teacher_id').eq('id', id).maybeSingle()
      if (!s || s.teacher_id !== user.id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { error } = await admin.from('students').update({ status }).eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

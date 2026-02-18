import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    const admin = createAdminClient()

    await admin.from('profiles').update({ role: 'teacher' }).eq('id', user.id)

    const { error } = await admin
      .from('teachers')
      .update({ status: 'active', user_id: user.id })
      .or(`email.ilike.${String(user.email || '').toLowerCase().trim()},user_id.eq.${user.id}`)
      .eq('status', 'pending')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

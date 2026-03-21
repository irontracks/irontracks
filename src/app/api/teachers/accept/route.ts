import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'
import { safePg } from '@/utils/safePgFilter'

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
      .or(`email.ilike.${safePg(user.email)},user_id.eq.${safePg(user.id)}`)
      .eq('status', 'pending')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

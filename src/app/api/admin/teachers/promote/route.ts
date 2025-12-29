import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== ADMIN_EMAIL) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json()
    const email = (body?.email || '').toLowerCase().trim()
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

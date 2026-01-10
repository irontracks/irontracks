import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

const isAllowed = async (admin: ReturnType<typeof createAdminClient>, user: { id: string; email?: string | null }) => {
  const email = (user.email || '').toLowerCase()
  if (email && email === ADMIN_EMAIL.toLowerCase()) return true

  let teacher: any | null = null
  const { data: byUserId } = await admin
    .from('teachers')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  teacher = byUserId || null

  if (!teacher?.id && email) {
    const { data: byEmail } = await admin
      .from('teachers')
      .select('id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    teacher = byEmail || null
  }

  if (teacher?.id) return true

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  return profile?.role === 'admin' || profile?.role === 'teacher'
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    const admin = createAdminClient()

    const allowed = await isAllowed(admin, user)
    if (!allowed) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json()
    const { id } = body || {}
    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const { data: w } = await admin.from('workouts').select('id, is_template').eq('id', id).maybeSingle()
    if (!w?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (w?.is_template !== true) return NextResponse.json({ ok: false, error: 'refuse_non_template' }, { status: 400 })

    const { data: exs } = await admin.from('exercises').select('id').eq('workout_id', id)
    const exIds = (exs || []).map((e) => e.id)
    if (exIds.length > 0) {
      await admin.from('sets').delete().in('exercise_id', exIds)
    }
    await admin.from('exercises').delete().eq('workout_id', id)
    const { error } = await admin.from('workouts').delete().eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

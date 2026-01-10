import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

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

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const id = url.searchParams.get('id') || undefined
    const email = url.searchParams.get('email') || undefined

    const admin = createAdminClient()
    const allowed = await isAllowed(admin, user)
    if (!allowed) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    // Resolve to profiles.id (auth uid)
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

    const { data: rows } = await admin
      .from('workouts')
      .select('*, exercises(*, sets(*))')
      .or(`user_id.eq.${targetUserId},student_id.eq.${targetUserId}`)
      .eq('is_template', true)
      .order('name')

    return NextResponse.json({ ok: true, rows: rows || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

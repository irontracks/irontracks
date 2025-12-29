import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

const getRole = async (admin: ReturnType<typeof createAdminClient>, userId: string) => {
  const { data } = await admin.from('profiles').select('role, email').eq('id', userId).maybeSingle()
  const role = (data?.role || 'user') as string
  const email = (data?.email || '') as string
  return { role, email }
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const teacherUserId = (url.searchParams.get('teacherUserId') || '').trim()

    let q = supabase
      .from('teacher_plans')
      .select('id, teacher_user_id, name, description, price_cents, currency, interval, status, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (teacherUserId) q = q.eq('teacher_user_id', teacherUserId)

    const { data, error } = await q
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, plans: data || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const name = (body?.name || '').trim()
    const description = (body?.description || '').trim()
    const priceCents = Number(body?.priceCents)
    const interval = (body?.interval || 'month') as string
    const status = (body?.status || 'active') as string

    if (!name || !Number.isFinite(priceCents) || priceCents <= 0) {
      return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    }
    if (!['month', 'year'].includes(interval)) {
      return NextResponse.json({ ok: false, error: 'invalid_interval' }, { status: 400 })
    }
    if (!['active', 'inactive'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 400 })
    }

    const admin = createAdminClient()
    const prof = await getRole(admin, user.id)
    const normalizedEmail = (user.email || '').toLowerCase().trim()
    const isAdmin = prof.role === 'admin' || normalizedEmail === ADMIN_EMAIL.toLowerCase()
    const isTeacher = prof.role === 'teacher'
    if (!isAdmin && !isTeacher) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('teacher_plans')
      .insert({
        teacher_user_id: user.id,
        name,
        description: description || null,
        price_cents: priceCents,
        interval,
        status,
      })
      .select('id, teacher_user_id, name, description, price_cents, currency, interval, status, created_at, updated_at')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, plan: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


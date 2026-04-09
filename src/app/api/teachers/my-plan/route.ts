import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    // Fetch teacher row with plan info
    const { data: teacher, error: tErr } = await admin
      .from('teachers')
      .select('id, plan_tier_key, plan_status, plan_valid_until, plan_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 400 })

    const tierKey: string = (teacher?.plan_tier_key as string | null) ?? 'free'
    const planStatus: string = (teacher?.plan_status as string | null) ?? 'active'

    // Fetch tier details
    const { data: tier } = await admin
      .from('teacher_tiers')
      .select('tier_key, name, description, max_students, price_cents, currency, sort_order')
      .eq('tier_key', tierKey)
      .maybeSingle()

    // Student count via RPC
    const { data: countResult } = await admin
      .rpc('teacher_student_count', { p_teacher_user_id: user.id })

    const studentCount = Number(countResult ?? 0)
    const maxStudents = Number((tier?.max_students as number | null) ?? 2)
    const canAddStudent = maxStudents === 0 || studentCount < maxStudents

    return NextResponse.json({
      ok: true,
      plan: tier ?? { tier_key: 'free', name: 'Free', max_students: 2, price_cents: 0 },
      status: planStatus,
      valid_until: (teacher?.plan_valid_until as string | null) ?? null,
      student_count: studentCount,
      max_students: maxStudents,
      can_add_student: canAddStudent,
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

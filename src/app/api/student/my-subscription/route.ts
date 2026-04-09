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

    // Get the most recent active/pending subscription
    const { data: sub, error } = await admin
      .from('student_subscriptions')
      .select(`
        id, status, started_at, expires_at, next_due_date, last_payment_at, teacher_user_id,
        plan_id,
        student_service_plans (
          id, name, description, price_cents, billing_interval, duration_days,
          sessions_per_week, session_duration_minutes, training_days, notes
        )
      `)
      .eq('student_user_id', user.id)
      .in('status', ['active', 'pending', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    if (!sub) return NextResponse.json({ ok: true, subscription: null })

    // Get teacher profile
    const { data: teacherProfile } = await admin
      .from('profiles')
      .select('display_name, photo_url')
      .eq('id', sub.teacher_user_id)
      .maybeSingle()

    // Get latest pending charge
    const { data: charge } = await admin
      .from('student_charges')
      .select('id, status, amount_cents, pix_qr_code, pix_payload, invoice_url, due_date')
      .eq('subscription_id', sub.id)
      .eq('student_user_id', user.id)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      subscription: sub,
      teacher: teacherProfile ?? null,
      charge: charge ?? null,
    })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

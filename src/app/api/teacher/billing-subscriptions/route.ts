import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

// GET — list all student subscriptions for the teacher
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('student_subscriptions')
      .select(`
        id, student_user_id, status, started_at, expires_at, next_due_date, last_payment_at,
        plan_id,
        student_service_plans ( id, name, price_cents, billing_interval, duration_days )
      `)
      .eq('teacher_user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    // Enrich with profile names
    const studentIds = [...new Set((data ?? []).map(s => String(s.student_user_id)))]
    let profileMap: Record<string, string> = {}
    if (studentIds.length > 0) {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, display_name, email')
        .in('id', studentIds)
      profileMap = Object.fromEntries(
        (profiles ?? []).map(p => [String(p.id), String(p.display_name || p.email || p.id)])
      )
    }

    const enriched = (data ?? []).map(s => ({
      ...s,
      student_name: profileMap[String(s.student_user_id)] ?? String(s.student_user_id),
    }))

    return NextResponse.json({ ok: true, subscriptions: enriched })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

// POST — teacher assigns a plan to a student and optionally generates a charge
const AssignSchema = z.object({
  student_user_id: z.string().uuid(),
  plan_id: z.string().uuid(),
}).strip()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsed = await parseJsonBody(req, AssignSchema)
    if (parsed.response) return parsed.response
    const { student_user_id, plan_id } = parsed.data!

    const admin = createAdminClient()

    // Validate plan belongs to this teacher
    const { data: plan } = await admin
      .from('student_service_plans')
      .select('id, duration_days, price_cents')
      .eq('id', plan_id)
      .eq('teacher_user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (!plan) return NextResponse.json({ ok: false, error: 'plano_nao_encontrado' }, { status: 404 })

    // Upsert subscription (replace any existing pending one)
    const now = new Date()
    const dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + 3) // 3-day window to pay

    const { data: sub, error: subErr } = await admin
      .from('student_subscriptions')
      .upsert({
        teacher_user_id: user.id,
        student_user_id,
        plan_id,
        status: 'pending',
        next_due_date: dueDate.toISOString().slice(0, 10),
        updated_at: now.toISOString(),
      }, { onConflict: 'teacher_user_id,student_user_id,plan_id' })
      .select()
      .single()

    if (subErr || !sub) return NextResponse.json({ ok: false, error: subErr?.message ?? 'Erro ao criar assinatura' }, { status: 400 })
    return NextResponse.json({ ok: true, subscription: sub })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

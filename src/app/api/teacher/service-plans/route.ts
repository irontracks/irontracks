import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const

const PlanSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional().default(''),
  price_cents: z.number().int().min(0),
  billing_interval: z.enum(['once', 'monthly', 'quarterly', 'semiannual', 'yearly']).default('monthly'),
  duration_days: z.number().int().min(1).max(3650).default(30),
  sessions_per_week: z.number().int().min(1).max(7).nullable().optional(),
  session_duration_minutes: z.number().int().min(15).max(300).nullable().optional(),
  training_days: z.array(z.enum(DAYS)).default([]),
  notes: z.string().max(1000).optional().default(''),
  is_active: z.boolean().default(true),
}).strip()

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('student_service_plans')
      .select('id, name, description, price_cents, billing_interval, duration_days, sessions_per_week, session_duration_minutes, training_days, notes, is_active, created_at, teacher_user_id')
      .eq('teacher_user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, plans: data ?? [] })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsed = await parseJsonBody(req, PlanSchema)
    if (parsed.response) return parsed.response
    const body = parsed.data!

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('student_service_plans')
      .insert({ ...body, teacher_user_id: user.id })
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, plan: data })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

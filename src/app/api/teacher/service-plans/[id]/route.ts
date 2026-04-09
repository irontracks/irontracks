import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const

const PatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  price_cents: z.number().int().min(0).optional(),
  billing_interval: z.enum(['once', 'monthly', 'quarterly', 'semiannual', 'yearly']).optional(),
  duration_days: z.number().int().min(1).max(3650).optional(),
  sessions_per_week: z.number().int().min(1).max(7).nullable().optional(),
  session_duration_minutes: z.number().int().min(15).max(300).nullable().optional(),
  training_days: z.array(z.enum(DAYS)).optional(),
  notes: z.string().max(1000).optional(),
  is_active: z.boolean().optional(),
}).strip()

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const parsed = await parseJsonBody(req, PatchSchema)
    if (parsed.response) return parsed.response
    const body = parsed.data!

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('student_service_plans')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('teacher_user_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    if (!data) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true, plan: data })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const admin = createAdminClient()

    // Soft-delete: just deactivate the plan
    const { error } = await admin
      .from('student_service_plans')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('teacher_user_id', user.id)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

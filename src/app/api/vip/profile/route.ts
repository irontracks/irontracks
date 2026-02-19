import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { getVipPlanLimits } from '@/utils/vip/limits'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const PutBodySchema = z
  .object({
    goal: z.string().optional(),
    equipment: z.string().optional(),
    constraints: z.string().optional(),
    preferences: z.record(z.unknown()).optional(),
  })
  .passthrough()

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const entitlement = await getVipPlanLimits(supabase, user.id)
  if (entitlement.tier === 'free') return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  try {
    const { data, error } = await supabase
      .from('vip_profile')
      .select('user_id, goal, equipment, constraints, preferences, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, profile: data || null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const supabase = auth.supabase
  const user = auth.user

  const entitlement = await getVipPlanLimits(supabase, user.id)
  if (entitlement.tier === 'free') return NextResponse.json({ ok: false, error: 'vip_required' }, { status: 403 })

  try {
    const parsedBody = await parseJsonBody(req, PutBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const goal = typeof body?.goal === 'string' ? body.goal.trim() : null
    const equipment = typeof body?.equipment === 'string' ? body.equipment.trim() : null
    const constraints = typeof body?.constraints === 'string' ? body.constraints.trim() : null
    const preferences = body?.preferences && typeof body.preferences === 'object' && !Array.isArray(body.preferences) ? body.preferences : {}

    const { data, error } = await supabase
      .from('vip_profile')
      .upsert(
        {
          user_id: user.id,
          goal: goal || null,
          equipment: equipment || null,
          constraints: constraints || null,
          preferences,
        },
        { onConflict: 'user_id' },
      )
      .select('user_id, goal, equipment, constraints, preferences, updated_at')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, profile: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

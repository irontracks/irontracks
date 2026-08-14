import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { createAdminClient } from '@/utils/supabase/admin'
import { respondDbError } from '@/utils/api/dbError'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('teacher_tiers')
      .select('tier_key, name, description, max_students, price_cents, currency, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) return respondDbError('teacher:plans', error)
    return NextResponse.json({ ok: true, plans: data ?? [] })
  } catch (e: unknown) {
    return respondInternalError('api:teachers:plans', e)
  }
}

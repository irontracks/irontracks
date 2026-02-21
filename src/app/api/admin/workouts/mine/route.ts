import { NextResponse } from 'next/server'
import { requireRoleWithBearer } from '@/utils/auth/route'
import { createClient } from '@/utils/supabase/server'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let resolvedUser = user
    let resolvedSupabase = supabase

    if (!resolvedUser) {
      const auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) return auth.response
      resolvedUser = auth.user
      resolvedSupabase = auth.supabase
    }

    if (!resolvedUser) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { data, error } = await resolvedSupabase
      .from('workouts')
      .select('*, exercises(*, sets(*))')
      .eq('is_template', true)
      .eq('user_id', resolvedUser.id)
      .order('name')

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, rows: data || [] })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

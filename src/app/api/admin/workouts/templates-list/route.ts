import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('workouts')
      .select('*, exercises(*, sets(*))')
      .eq('is_template', true)
      .eq('user_id', user.id)
      .order('name')

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, rows: data || [] })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

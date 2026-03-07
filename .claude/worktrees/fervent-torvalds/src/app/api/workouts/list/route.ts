import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const query = supabase
      .from('workouts')
      .select('id, name, user_id')
      .eq('user_id', user.id)
      .order('name')

    const { data, error } = await query
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const rows = data || []
    return NextResponse.json({ ok: true, rows })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

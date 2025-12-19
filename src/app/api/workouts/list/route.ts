import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    // const isAdmin = user.email === ADMIN_EMAIL // Not used for filtering anymore
    const admin = createAdminClient()

    // Always filter by athlete_uuid = user.id to get "My Workouts" (legacy)
    // regardless of admin status, as this endpoint is for the personal dashboard.
    let query = admin
      .from('workouts')
      .select('id, uuid, name, athlete_uuid, is_deleted')
      .eq('athlete_uuid', user.id)
      .order('name')

    const { data, error } = await query
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const rows = (data || []).filter(w => w.is_deleted !== true)
    return NextResponse.json({ ok: true, rows })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

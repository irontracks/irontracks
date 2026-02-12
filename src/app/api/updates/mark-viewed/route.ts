import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const user = auth.user

    const body = await req.json().catch(() => ({}))
    const updateId = String(body?.updateId || body?.update_id || '').trim()
    if (!updateId) return NextResponse.json({ ok: false, error: 'missing_update_id' }, { status: 400 })

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('user_update_views')
      .upsert(
        { user_id: user.id, update_id: updateId, prompted_at: nowIso, viewed_at: nowIso },
        { onConflict: 'user_id,update_id' }
      )
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

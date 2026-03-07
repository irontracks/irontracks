import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase: any = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { error } = await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


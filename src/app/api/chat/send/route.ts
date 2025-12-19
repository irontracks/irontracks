import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await request.json()
    const { channel_id, content } = body || {}
    if (!channel_id || !content) return NextResponse.json({ ok: false, error: 'channel_id and content required' }, { status: 400 })

    const admin = createAdminClient()
    const { data: inserted, error } = await admin
      .from('messages')
      .insert({ channel_id, user_id: user.id, content })
      .select('id, created_at')
      .single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, inserted })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


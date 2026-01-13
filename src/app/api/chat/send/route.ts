import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const channel_id = body?.channel_id as string
    const content = (body?.content ?? '') as string
    if (!channel_id || !content) return NextResponse.json({ ok: false, error: 'missing fields' }, { status: 400 })

    const { data, error } = await supabase
      .from('messages')
      .insert({ channel_id, user_id: user.id, content })
      .select('*')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, message: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


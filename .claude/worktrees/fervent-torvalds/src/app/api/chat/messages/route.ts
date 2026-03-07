import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const channel_id = url.searchParams.get('channel_id') || ''
    if (!channel_id) return NextResponse.json({ ok: false, error: 'missing channel_id' }, { status: 400 })

    const { data: msgs, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', channel_id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const ids = Array.from(new Set((msgs || []).map(m => m.user_id).filter(Boolean)))
    let profs: any[] = []
    if (ids.length) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id, display_name, photo_url')
        .in('id', ids)
      profs = p || []
    }
    const map = new Map(profs.map(x => [x.id, x]))
    const enriched = (msgs || []).map(m => ({ ...m, profiles: map.get(m.user_id) || null }))
    return NextResponse.json({ ok: true, data: enriched })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as any)?.message ?? String(e) }, { status: 500 })
  }
}

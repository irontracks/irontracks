import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  channel_id: z.string().min(1, 'channel_id obrigatório'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response
    if (!q) return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 })

    const { data: msgs, error } = await supabase
      .from('messages')
      .select('*')
      .eq('channel_id', q.channel_id)
      .order('created_at', { ascending: false })
      .limit(q.limit)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const ids = Array.from(new Set((msgs || []).map(m => m.user_id).filter(Boolean)))
    let profs: Array<{ id: string; display_name: string | null; photo_url: string | null }> = []
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
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

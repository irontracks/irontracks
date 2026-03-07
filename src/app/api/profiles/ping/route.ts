import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { checkRateLimitAsync } from '@/utils/rateLimit'
import { getUpstashConfig } from '@/utils/cache'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const cfg = getUpstashConfig()
    if (cfg) {
      const now = Date.now()
      const fiveMinsAgo = now - 5 * 60 * 1000
      try {
        await Promise.all([
          fetch(`${cfg.url}/zremrangebyscore/online_users/-inf/${fiveMinsAgo}`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
          }),
          fetch(`${cfg.url}/zadd/online_users/${now}/${user.id}`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
          }),
        ])
      } catch { }
    }

    const rl = await checkRateLimitAsync(`profiles:ping:pg:${user.id}`, 1, 5 * 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store, max-age=0' } })

    const { error } = await supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store, max-age=0' } })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as { message?: string })?.message ?? String(e) }, { status: 500 })
  }
}


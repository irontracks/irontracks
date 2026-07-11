import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'
import { getUpstashConfig } from '@/utils/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const auth = await requireUser()
        if (!auth.ok) return auth.response

        const cfg = getUpstashConfig()
        if (!cfg) return NextResponse.json({ ok: true, online_users: [] })

        const now = Date.now()
        const fiveMinsAgo = now - 5 * 60 * 1000

        // Cleanup old explicitly
        await fetch(`${cfg.url}/zremrangebyscore/online_users/-inf/${fiveMinsAgo}`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
        }).catch(() => { })

        // Fetch all currently online
        const res = await fetch(`${cfg.url}/zrangebyscore/online_users/${fiveMinsAgo}/+inf`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
        })

        if (!res.ok) return NextResponse.json({ ok: false, error: 'failed_to_fetch_presence' }, { status: 500 })

        const data = await res.json()
        const online = (Array.isArray(data?.result) ? data.result : []).map((x: unknown) => String(x || '').trim()).filter(Boolean)
        if (!online.length) return NextResponse.json({ ok: true, online_users: [] })

        // Filtra server-side: só devolve quem o CHAMADOR segue (accepted). Antes retornava
        // o sorted set global cru — qualquer autenticado montava "quem está online agora"
        // de TODA a base (incluindo contas privadas e não-seguidos), de-anonimizável via
        // profiles_public. O recorte por follow existia só no cliente. Usa auth.supabase
        // (RLS: a policy de SELECT de social_follows já limita a follower_id = auth.uid()).
        const { data: follows } = await auth.supabase
            .from('social_follows')
            .select('following_id')
            .eq('follower_id', auth.user.id)
            .eq('status', 'accepted')
        const followingSet = new Set((Array.isArray(follows) ? follows : []).map((r) => String((r as { following_id?: string })?.following_id || '').trim()))
        const result = online.filter((uid: string) => followingSet.has(uid))

        return NextResponse.json({ ok: true, online_users: result })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
    }
}

import { NextResponse } from 'next/server'
import { requireUser } from '@/utils/auth/route'
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
        const result = Array.isArray(data?.result) ? data.result : []

        return NextResponse.json({ ok: true, online_users: result })
    } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: (e as Error)?.message || 'unknown_error' }, { status: 500 })
    }
}

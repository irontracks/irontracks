import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getInternalSecret, hasValidInternalSecret } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const isAuthorized = (req: Request) => {
  if (hasValidInternalSecret(req)) return true
  try {
    const url = new URL(req.url)
    const provided = String(url.searchParams.get('secret') || '').trim()
    const secret = getInternalSecret()
    return !!secret && provided === secret
  } catch {
    return false
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: rows } = await admin
    .from('soft_delete_bin')
    .select('id')
    .lte('purge_after', nowIso)
    .limit(500)

  const ids = (rows || []).map((r) => String((r as any).id || '')).filter(Boolean)
  if (ids.length) {
    await admin.from('soft_delete_bin').delete().in('id', ids)
  }

  await admin.from('audit_events').insert({
    actor_role: 'service',
    action: 'cron_purge_soft_delete_bin',
    entity_type: 'cron',
    metadata: { purged: ids.length },
  })

  return NextResponse.json({ ok: true, purged: ids.length })
}


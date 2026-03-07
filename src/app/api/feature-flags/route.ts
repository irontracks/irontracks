import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { cacheGet, cacheSet } from '@/utils/cache'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const CACHE_KEY = 'global:feature_flags'
const CACHE_TTL = 30 // 30 seconds

interface FlagRow {
  key: string
  enabled: boolean
  description: string | null
  owner: string | null
  review_at: string | null
  metadata: Record<string, unknown> | null
  updated_at: string | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

export async function GET() {
  try {
    // Try cache first
    const cached = await cacheGet<Record<string, unknown>>(CACHE_KEY, (v) => (isRecord(v) ? v : null))
    if (cached) return NextResponse.json(cached)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: rows, error } = await supabase
      .from('feature_flags')
      .select('key, enabled, description, owner, review_at, metadata, updated_at')
      .order('key')

    if (error) {
      // Table doesn't exist yet — fall back to hardcoded flags
      const { listFeatureFlags } = await import('@/utils/featureFlags')
      return NextResponse.json({ ok: true, flags: listFeatureFlags(), source: 'hardcoded' })
    }

    const flags = (rows as FlagRow[]).reduce<Record<string, boolean>>((acc, row) => {
      acc[row.key] = row.enabled
      return acc
    }, {})

    const payload = { ok: true, flags, source: 'database' }
    await cacheSet(CACHE_KEY, payload, CACHE_TTL)
    return NextResponse.json(payload)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const UPDATE_PROMPT_COOLDOWN_MS = 2 * 60 * 60 * 1000
const UPDATE_BATCH_SIZE_MULTIPLIER = 5
const UPDATE_MIN_BATCH = 5

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5).default(1),
})

export async function GET(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const user = auth.user

    const { data: q, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

    const limit = q?.limit ?? 1
    const batchSize = Math.max(UPDATE_MIN_BATCH, limit * UPDATE_BATCH_SIZE_MULTIPLIER)

    const nowIso = new Date().toISOString()
    const { data: updates, error } = await supabase
      .from('update_notifications')
      .select('id, version, title, description, release_date')
      .eq('is_active', true)
      .lte('release_date', nowIso)
      .order('release_date', { ascending: false })
      .limit(batchSize)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const safeUpdates = Array.isArray(updates) ? updates : []
    const updateIds = safeUpdates.map((u) => u.id).filter(Boolean)
    if (!updateIds.length) return NextResponse.json({ ok: true, updates: [] })

    const { data: views, error: viewsError } = await supabase
      .from('user_update_views')
      .select('update_id, viewed_at, prompted_at')
      .eq('user_id', user.id)
      .in('update_id', updateIds)
    if (viewsError) return NextResponse.json({ ok: false, error: viewsError.message }, { status: 400 })

    const viewMap = new Map<string, { viewed_at: string | null; prompted_at: string | null }>()
    ;(Array.isArray(views) ? views : []).forEach((row: any) => {
      if (!row?.update_id) return
      viewMap.set(String(row.update_id), {
        viewed_at: row.viewed_at ?? null,
        prompted_at: row.prompted_at ?? null,
      })
    })

    const now = Date.now()
    const filtered = safeUpdates.filter((u) => {
      const row = viewMap.get(String(u.id))
      if (row?.viewed_at) return false
      if (row?.prompted_at) {
        const promptedAt = Date.parse(String(row.prompted_at))
        if (Number.isFinite(promptedAt) && now - promptedAt < UPDATE_PROMPT_COOLDOWN_MS) return false
      }
      return true
    })

    return NextResponse.json({ ok: true, updates: filtered.slice(0, limit) })
  } catch (e: any) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

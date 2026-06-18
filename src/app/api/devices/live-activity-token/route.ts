/**
 * POST /api/devices/live-activity-token
 *
 * Stores per-Live-Activity push tokens captured by the iOS plugin (Feature 11).
 * Each Live Activity (rest timer, workout) gets its own token that rotates over
 * time. The backend reads these tokens to update the Dynamic Island remotely
 * via APNs (apns-topic: <bundleId>.push-type.liveactivity).
 *
 * Upserts on (user_id, kind, activity_id) so token rotations replace the prior
 * row instead of accumulating stale tokens.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'

const norm = (v: unknown) => String(v ?? '').trim()

const BodySchema = z.object({
  token: z.string().optional(),
  kind: z.string().optional(),
  activityId: z.string().optional(),
  platform: z.string().optional(),
}).passthrough()

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const parsed = await parseJsonBody(request, BodySchema)
    const body = parsed.data ?? {}

    const token = norm(body?.token)
    const kind = norm(body?.kind) // 'rest' | 'workout' | …
    const activityId = norm(body?.activityId)
    const platform = norm(body?.platform) || 'ios'

    if (!token || !kind) {
      return NextResponse.json({ ok: false, error: 'missing token or kind' }, { status: 400 })
    }
    if (token.length < 32 || token.length > 256) {
      return NextResponse.json({ ok: false, error: 'invalid token length' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('live_activity_push_tokens')
      .upsert(
        {
          user_id: user.id,
          kind,
          activity_id: activityId || '',
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,kind,activity_id' },
      )

    if (error) {
      // Table may not exist yet (migration not applied) — fail soft so the
      // client doesn't loop on every token rotation. We may see either the
      // direct Postgres error (42P01 / "does not exist") or, since supabase-js
      // goes through PostgREST, the schema-cache error (PGRST205 / "could not
      // find the table ... in the schema cache").
      const code = String(error.code || '').toLowerCase()
      const errMsg = String(error.message || '')
      const tableMissing =
        code === '42p01' ||
        code === 'pgrst205' ||
        /does not exist/i.test(errMsg) ||
        /schema cache/i.test(errMsg) ||
        /could not find the table/i.test(errMsg)
      if (tableMissing) {
        return NextResponse.json({ ok: true, deferred: true })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

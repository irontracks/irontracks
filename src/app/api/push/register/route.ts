/**
 * POST /api/push/register
 *
 * Stores a device push token for the authenticated user.
 * Called by usePushNotifications.ts on every app open after
 * Capacitor obtains the APNs / FCM registration token.
 *
 * Upserts on (token) primary key — safe to call repeatedly.
 * Updates last_seen_at so the 90-day cleanup job doesn't remove active tokens.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const normalizeToken = (v: unknown) => String(v ?? '').trim()

const normalizePlatform = (v: unknown): 'ios' | 'android' | 'web' => {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'ios' || s === 'android' || s === 'web') return s
  return 'ios'
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown> = {}
    try { body = await request.json() } catch { /* empty body */ }

    const token = normalizeToken(body?.token)
    const platform = normalizePlatform(body?.platform)
    const deviceId = String(body?.deviceId ?? body?.device_id ?? '').trim()

    if (!token) {
      return NextResponse.json({ ok: false, error: 'missing token' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('device_push_tokens')
      .upsert(
        {
          token,
          user_id: user.id,
          platform,
          device_id: deviceId || null,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      )

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

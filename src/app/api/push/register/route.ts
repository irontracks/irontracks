import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const normalizeToken = (v: unknown) => String(v ?? '').trim()
const normalizePlatform = (v: unknown) => {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'ios' || s === 'android' || s === 'web') return s
  return 'ios'
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = (await req.json().catch((): null => null)) as Record<string, unknown> | null
    const token = normalizeToken(body?.token)
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })

    const platform = normalizePlatform(body?.platform)
    const deviceId = normalizeToken(body?.deviceId) || null

    const { error } = await supabase
      .from('device_push_tokens')
      .upsert(
        {
          user_id: user.id,
          platform,
          token,
          device_id: deviceId,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' }
      )

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 400 })
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = (await req.json().catch((): null => null)) as Record<string, unknown> | null
    const token = normalizeToken(body?.token)
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })

    const { error } = await supabase.from('device_push_tokens').delete().eq('user_id', user.id).eq('token', token)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 400 })
  }
}


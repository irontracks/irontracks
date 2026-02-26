import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getErrorMessage } from '@/utils/errorMessage'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  token: z.string().min(1),
  platform: z.string().optional(),
  deviceId: z.string().optional(),
}).strip()

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

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data!
    const token = normalizeToken((body as Record<string, unknown>)?.token)
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })

    const platform = normalizePlatform((body as Record<string, unknown>)?.platform)
    const deviceId = normalizeToken((body as Record<string, unknown>)?.deviceId) || null

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

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const body = parsed.data!
    const token = normalizeToken((body as Record<string, unknown>)?.token)
    if (!token) return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })

    const { error } = await supabase.from('device_push_tokens').delete().eq('user_id', user.id).eq('token', token)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 400 })
  }
}

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

/**
 * First-touch attribution endpoint. The client posts UTM params captured
 * from the URL on the user's very first visit. The server only writes if
 * profiles.acquisition_source is still NULL — never overwrites an existing
 * attribution.
 *
 * The client should use sane fallbacks: missing fields are dropped so we
 * don't pollute analytics with empty strings.
 */
const BodySchema = z
  .object({
    source: z.string().trim().max(80).optional(),
    medium: z.string().trim().max(80).optional(),
    campaign: z.string().trim().max(120).optional(),
    content: z.string().trim().max(120).optional(),
    term: z.string().trim().max(120).optional(),
    referrer: z.string().trim().max(255).optional(),
    landing_path: z.string().trim().max(255).optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`profiles:acquisition:${auth.user.id}:${ip}`, 5, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response

    const data = parsed.data!
    const cleanEntries = Object.entries(data).filter(([, v]) => typeof v === 'string' && v.length > 0)
    if (!cleanEntries.length) return NextResponse.json({ ok: true, skipped: 'empty' })

    // First-touch: only write if acquisition_source is currently NULL.
    const { data: existing } = await auth.supabase
      .from('profiles')
      .select('acquisition_source')
      .eq('id', auth.user.id)
      .maybeSingle()

    if (existing?.acquisition_source) {
      return NextResponse.json({ ok: true, skipped: 'already_attributed' })
    }

    const payload = {
      ...Object.fromEntries(cleanEntries),
      first_seen_at: new Date().toISOString(),
    }

    const { error } = await auth.supabase
      .from('profiles')
      .update({ acquisition_source: payload })
      .eq('id', auth.user.id)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, attributed: payload })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) ?? String(e) }, { status: 500 })
  }
}

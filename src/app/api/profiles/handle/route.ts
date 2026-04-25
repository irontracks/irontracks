import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const HANDLE_RE = /^[a-z][a-z0-9_]{2,19}$/

const BodySchema = z
  .object({
    handle: z.string().trim().min(3).max(20),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`profiles:handle:${auth.user.id}:${ip}`, 10, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response

    const handle = String(parsed.data!.handle).trim().toLowerCase()
    if (!HANDLE_RE.test(handle)) {
      return NextResponse.json(
        { ok: false, error: 'invalid_format', message: 'Use 3-20 caracteres, comece com letra, apenas letras minúsculas, números e underscore.' },
        { status: 400 },
      )
    }

    const { error } = await auth.supabase
      .from('profiles')
      .update({ handle })
      .eq('id', auth.user.id)

    if (error) {
      const code = (error as { code?: string }).code
      if (code === '23505') {
        return NextResponse.json({ ok: false, error: 'handle_taken' }, { status: 409 })
      }
      if (code === '23514') {
        return NextResponse.json({ ok: false, error: 'invalid_format' }, { status: 400 })
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, handle })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) ?? String(e) }, { status: 500 })
  }
}

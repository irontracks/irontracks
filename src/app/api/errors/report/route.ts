import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { getErrorMessage } from '@/utils/errorMessage'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    message: z.string().min(1),
    stack: z.string().optional(),
    pathname: z.string().optional(),
    url: z.string().optional(),
    userAgent: z.string().optional(),
    appVersion: z.string().optional(),
    source: z.string().optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .strip()

const trimLen = (v: unknown, max: number) => {
  const s = String(v ?? '')
  if (!s) return ''
  return s.length > max ? s.slice(0, max) : s
}

/** Strip potential secrets from stack traces before persisting */
const sanitizeStack = (raw: string): string => {
  return raw
    .replace(/(?:api[_-]?key|token|secret|password|authorization|bearer)\s*[:=]\s*\S+/gi, '[REDACTED]')
    .replace(/(?:https?:\/\/)[^\s]*(?:key|token|secret|auth)[^\s]*/gi, '[REDACTED_URL]')
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const ip = getRequestIp(request)
    const rl = await checkRateLimitAsync(`errors:report:${user.id}:${ip}`, 30, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const parsedBody = await parseJsonBody(request, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const message = trimLen(body?.message, 1200)
    if (!message) return NextResponse.json({ ok: false, error: 'missing message' }, { status: 400 })

    const rawStack = trimLen(body?.stack, 12000) || null
    const stack = rawStack ? sanitizeStack(rawStack) : null
    const pathname = trimLen(body?.pathname, 512) || null
    const url = trimLen(body?.url, 2048) || null
    const userAgent = trimLen(body?.userAgent, 1024) || null
    const appVersion = trimLen(body?.appVersion, 64) || null
    const source = trimLen(body?.source, 64) || 'client'
    const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {}

    const { data, error } = await supabase
      .from('error_reports')
      .insert({
        user_id: user.id,
        user_email: user.email ?? null,
        message,
        stack,
        pathname,
        url,
        user_agent: userAgent,
        app_version: appVersion,
        source,
        meta,
        status: 'new',
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: data?.id ?? null })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

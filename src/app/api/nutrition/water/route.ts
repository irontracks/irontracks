import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { setWaterCore, resolveDateKey } from '@/lib/nutrition/mutations'
import { respondInternalError } from '@/utils/api/internalError'

export const dynamic = 'force-dynamic'

/** Upsert da água do dia. Usada pela fila offline (`nutrition_water`). */

const BodySchema = z
  .object({
    ml: z.coerce.number().nonnegative(),
    dateKey: z.string().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:water:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response

    const { ml, dateKey } = parsed.data!
    const { water_ml } = await setWaterCore(auth.supabase, userId, ml, resolveDateKey(dateKey))
    return NextResponse.json({ ok: true, water_ml })
  } catch (e: unknown) {
    return respondInternalError('api:nutrition:water', e)
  }
}

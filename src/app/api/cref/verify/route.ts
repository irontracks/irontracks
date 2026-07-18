import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyCref } from '@/lib/cref/verifyCref'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    cref: z.string().min(1).max(40),
    full_name: z.string().min(2).max(160),
  })
  .strip()

export async function POST(req: Request) {
  const ip = getRequestIp(req)
  const rateLimit = await checkRateLimitAsync(`cref_verify:${ip}`, 10, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'Muitas verificações. Aguarde um minuto e tente novamente.' }, { status: 429 })
  }

  const parsedBody = await parseJsonBody(req, BodySchema)
  if (parsedBody.response) return parsedBody.response

  const { cref, full_name: fullName } = parsedBody.data!
  const verification = await verifyCref(cref, fullName)

  return NextResponse.json({ ok: true, ...verification })
}

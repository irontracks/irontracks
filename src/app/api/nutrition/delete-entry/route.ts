import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { parseJsonBody } from '@/utils/zod'
import { deleteEntryCore } from '@/lib/nutrition/mutations'

export const dynamic = 'force-dynamic'

/** Exclui uma entry. Usada pela fila offline (`nutrition_delete`). */

const BodySchema = z
  .object({ entryId: z.string().min(1) })
  .strip()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const userId = String(auth.user.id || '').trim()

    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`nutrition:delete-entry:${userId}:${ip}`, 30, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response

    const { totals } = await deleteEntryCore(auth.supabase, userId, parsed.data!.entryId)
    return NextResponse.json({ ok: true, totals })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message || 'nutrition_delete_entry_failed' }, { status: 500 })
  }
}

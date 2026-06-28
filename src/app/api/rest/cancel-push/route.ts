/**
 * POST /api/rest/cancel-push
 *
 * Cancela um push de fim de descanso agendado (o usuário voltou ao app, pulou
 * ou terminou o descanso antes do fim). Idempotente — cancelar um id já
 * disparado/inexistente apenas retorna ok:false sem erro fatal.
 *
 * Body: { scheduleId: string }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { parseJsonBody } from '@/utils/zod'
import { cancelRestEndPush } from '@/lib/push/restEndScheduler'
import { cacheGet, cacheDelete } from '@/utils/cache'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  scheduleId: z.string().min(1),
}).passthrough()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const b = parsed.data as z.infer<typeof BodySchema>
    const scheduleId = String(b.scheduleId)

    // Ownership (auditoria 2026-06-27, L8): se há mapping e pertence a OUTRO
    // usuário, recusa — fecha o IDOR de cancelar push agendado alheio. Cache miss
    // (expirado/indisponível) segue, pois o scheduleId é opaco/não-enumerável.
    const owner = await cacheGet<string>(`rest:push:owner:${scheduleId}`, (v) => (typeof v === 'string' ? v : null))
    if (owner && owner !== user.id) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const cancelled = await cancelRestEndPush(scheduleId)
    try { await cacheDelete(`rest:push:owner:${scheduleId}`) } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, cancelled })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

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

    const cancelled = await cancelRestEndPush(String(b.scheduleId))
    return NextResponse.json({ ok: true, cancelled })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

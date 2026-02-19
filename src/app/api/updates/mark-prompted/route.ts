import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { parseJsonBody } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    updateId: z.string().optional(),
    update_id: z.string().optional(),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const auth = await requireUser()
    if (!auth.ok) return auth.response
    const supabase = auth.supabase
    const user = auth.user

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const updateId = String(body?.updateId || body?.update_id || '').trim()
    if (!updateId) return NextResponse.json({ ok: false, error: 'missing_update_id' }, { status: 400 })

    const { data: existing, error: existingError } = await supabase
      .from('user_update_views')
      .select('viewed_at')
      .eq('user_id', user.id)
      .eq('update_id', updateId)
      .maybeSingle()
    if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 400 })
    if (existing?.viewed_at) return NextResponse.json({ ok: true, alreadyViewed: true })

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('user_update_views')
      .upsert({ user_id: user.id, update_id: updateId, prompted_at: nowIso }, { onConflict: 'user_id,update_id' })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

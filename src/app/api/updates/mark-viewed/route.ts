import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { requireUser } from '@/utils/auth/route'
import { getErrorMessage } from '@/utils/errorMessage'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    updateId: z.string().optional(),
    update_id: z.string().optional(),
  })
  .strip()

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

    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('user_update_views')
      .upsert(
        { user_id: user.id, update_id: updateId, prompted_at: nowIso, viewed_at: nowIso },
        { onConflict: 'user_id,update_id' }
      )
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(e) }, { status: 500 })
  }
}

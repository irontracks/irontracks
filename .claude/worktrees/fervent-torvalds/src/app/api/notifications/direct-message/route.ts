import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

const ZodBodySchema = z
  .object({
    receiverId: z.string().min(1),
    senderName: z.string().min(1),
    preview: z.string().min(1),
  })
  .passthrough()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body: any = parsedBody.data!
    const receiverId = (body?.receiverId || '').trim() as string
    const senderName = (body?.senderName || '').trim() as string
    const preview = (body?.preview || '').trim() as string

    if (!receiverId || !senderName || !preview) {
      return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    }

    if (receiverId !== user.id) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const safeSenderName = senderName.slice(0, 80)
    const safePreview = preview.slice(0, 240)
    if (!safeSenderName || !safePreview) {
      return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: prefRow } = await admin
      .from('user_settings')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle()

    const prefs = prefRow?.preferences && typeof prefRow.preferences === 'object' ? prefRow.preferences : null
    const allow = prefs ? prefs.notifyDirectMessages !== false : true
    if (!allow) return NextResponse.json({ ok: true, skipped: true })

    const { error } = await admin.from('notifications').insert({
      user_id: user.id,
      title: safeSenderName,
      message: safePreview,
      type: 'message',
    })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

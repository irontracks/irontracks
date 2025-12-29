import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const receiverId = (body?.receiverId || '').trim() as string
    const senderName = (body?.senderName || '').trim() as string
    const preview = (body?.preview || '').trim() as string

    if (!receiverId || !senderName || !preview) {
      return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
    }

    if (receiverId === user.id) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const admin = createAdminClient()
    const { error } = await admin.from('notifications').insert({
      user_id: receiverId,
      title: senderName,
      message: preview,
      type: 'message',
    })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


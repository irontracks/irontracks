import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { runChatDiagnostics } from '@/lib/chatDiagnostics'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const report = await runChatDiagnostics(supabase, user.id)
    return NextResponse.json(report)
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { channelId, content } = body
    if (!channelId) return NextResponse.json({ ok: false, error: 'channelId required' }, { status: 400 })
    const text = content || `diagnostic ping ${new Date().toISOString()}`

    const { data: inserted, error } = await supabase
      .from('direct_messages')
      .insert({ channel_id: channelId, sender_id: user.id, content: text })
      .select('id, created_at')
      .single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, inserted })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


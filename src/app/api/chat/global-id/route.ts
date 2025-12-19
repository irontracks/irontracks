import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function GET() {
  try {
    const admin = createAdminClient()
    const { data: globals } = await admin
      .from('chat_channels')
      .select('id')
      .eq('type','global')
      .order('created_at', { ascending: true })

    let id: string
    if (!globals || globals.length === 0) {
      const { data: created, error } = await admin
        .from('chat_channels')
        .insert({ type: 'global' })
        .select('id')
        .single()
      if (error) throw error
      id = created.id
    } else {
      id = globals[0].id
      // migrate legacy messages without channel_id
      await admin.from('messages').update({ channel_id: id }).is('channel_id', null)
      // merge messages from other accidental globals
      for (let i = 1; i < globals.length; i++) {
        const dup = globals[i].id
        await admin.from('messages').update({ channel_id: id }).eq('channel_id', dup)
        await admin.from('chat_channels').delete().eq('id', dup)
      }
    }
    return NextResponse.json({ ok: true, id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


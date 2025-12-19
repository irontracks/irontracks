import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channel_id')
    
    if (!channelId) {
      return NextResponse.json({ ok: false, error: 'Channel ID required' }, { status: 400 })
    }

    const admin = createAdminClient()
    
    // 1. Fetch messages (raw)
    const { data: messages, error: msgError } = await admin
      .from('messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (msgError) throw msgError
    if (!messages || messages.length === 0) return NextResponse.json({ ok: true, data: [] })

    // 2. Extract User IDs
    const userIds = Array.from(new Set(messages.map(m => m.user_id)))

    // 3. Fetch Profiles manually
    const { data: profiles, error: profError } = await admin
      .from('profiles')
      .select('id, display_name, photo_url')
      .in('id', userIds)

    if (profError) throw profError

    // 4. Map profiles to a lookup object
    const profileMap = (profiles || []).reduce((acc, p) => {
      acc[p.id] = p
      return acc
    }, {} as Record<string, any>)

    // 5. Attach profiles to messages
    const data = messages.map(m => ({
      ...m,
      profiles: profileMap[m.user_id] || { display_name: 'Unknown', photo_url: null }
    }))

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


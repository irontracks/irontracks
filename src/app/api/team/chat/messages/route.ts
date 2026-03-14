import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/team/chat/messages?sessionId=xxx
 * Returns the last 50 team chat messages for a session (polling fallback).
 */
export async function GET(req: NextRequest) {
  try {
    // R2#3: Require authenticated user
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const sessionId = req.nextUrl.searchParams.get('sessionId')?.trim()
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'missing sessionId' }, { status: 400 })
    }

    const admin = createAdminClient()

    // R5#1: Verify user is a member of this session (teacher or participant)
    const { data: session } = await admin
      .from('team_sessions')
      .select('id, teacher_id')
      .eq('id', sessionId)
      .maybeSingle()
    if (!session?.id) return NextResponse.json({ ok: false, error: 'session_not_found' }, { status: 404 })

    const isTeacher = session.teacher_id === user.id
    if (!isTeacher) {
      const { data: participant } = await admin
        .from('team_session_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!participant?.id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data, error } = await admin
      .from('team_chat_messages')
      .select('id, session_id, user_id, display_name, photo_url, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data: data || [] })
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { isTeamSessionMember } from '@/utils/team/sessionMembership'
import { respondDbError } from '@/utils/api/dbError'

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

    // Membership: host / participante (participants[] jsonb) / presença ao vivo.
    // Antes referenciava team_sessions.teacher_id e a tabela
    // team_session_participants — AMBOS inexistentes no schema real → o GET sempre
    // falhava (fail-closed, mas quebrado). Auditoria 2026-06-27 (L5).
    if (!(await isTeamSessionMember(admin, sessionId, user.id))) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data, error } = await admin
      .from('team_chat_messages')
      .select('id, session_id, user_id, display_name, photo_url, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(50)

    if (error) {
      return respondDbError('team:chat:messages', error, 500)
    }

    return NextResponse.json({ ok: true, data: data || [] })
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: (e as Record<string, unknown>)?.message ?? String(e) },
      { status: 500 }
    )
  }
}

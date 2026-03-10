import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/team/chat/messages?sessionId=xxx
 * Returns the last 50 messages for a team session (used as polling fallback).
 */
export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('sessionId')?.trim()
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'missing sessionId' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('messages')
      .select('id, channel_id, user_id, content, created_at, profiles:user_id(display_name, photo_url)')
      .eq('channel_id', sessionId)
      .order('created_at', { ascending: false })
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

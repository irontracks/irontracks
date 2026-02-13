import { NextResponse } from 'next/server'

import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { getVideoQueriesFromGemini, searchYouTubeCandidates } from '@/lib/videoSuggestions'

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }
    const body = await req.json().catch(() => ({}))
    const name = String((body as any)?.name || '').trim()
    if (!name) return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 })

    const normalized = normalizeExerciseName(name)
    if (!normalized) return NextResponse.json({ ok: false, error: 'invalid_name' }, { status: 400 })

    const admin = createAdminClient()

    const { data: libRow, error: libErr } = await admin
      .from('exercise_library')
      .upsert({ display_name_pt: name, normalized_name: normalized }, { onConflict: 'normalized_name' })
      .select('id, normalized_name')
      .single()
    if (libErr || !libRow?.id) {
      return NextResponse.json({ ok: false, error: libErr?.message || 'library_upsert_failed' }, { status: 400 })
    }

    let queries: string[] = []
    try {
      queries = await getVideoQueriesFromGemini(name)
    } catch {
      queries = []
    }
    if (!queries.length) {
      queries = [`${name} execução`, `${name} técnica`, `${name} how to`]
    }

    const candidates: Array<{ videoId: string; url: string; title: string; channelTitle: string }> = []
    const seen = new Set<string>()

    for (const q of queries) {
      if (candidates.length >= 5) break
      const found = await searchYouTubeCandidates(q, 6)
      for (const it of found as any[]) {
        if (!it) continue
        const videoId = String((it as any).videoId || '').trim()
        if (!videoId || seen.has(videoId)) continue
        seen.add(videoId)
        candidates.push(it as any)
        if (candidates.length >= 5) break
      }
    }

    if (!candidates.length) {
      return NextResponse.json({ ok: false, error: 'no_candidates' }, { status: 404 })
    }

    const rows = candidates.map((c) => ({
      exercise_library_id: libRow.id,
      normalized_name: normalized,
      provider: 'youtube',
      provider_video_id: c.videoId,
      url: c.url,
      title: c.title || null,
      channel_title: c.channelTitle || null,
      status: 'pending',
      is_primary: false,
      created_by: auth.user.id,
    }))

    const { data: inserted, error: insertErr } = await admin
      .from('exercise_videos')
      .upsert(rows as any, { onConflict: 'exercise_library_id,provider,provider_video_id' })
      .select('id')

    if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 400 })

    const count = Array.isArray(inserted) ? inserted.length : 0
    return NextResponse.json({ ok: true, exercise_library_id: libRow.id, created: count })
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e)
    const status =
      msg === 'missing_youtube_key' || msg === 'missing_gemini_key'
        ? 400
        : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}

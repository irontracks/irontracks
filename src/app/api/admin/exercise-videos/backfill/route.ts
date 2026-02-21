import { NextResponse } from 'next/server'

import { parseJsonBody } from '@/utils/zod'
import { z } from 'zod'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { getVideoQueriesFromGemini, searchYouTubeCandidates } from '@/lib/videoSuggestions'
import { getErrorMessage } from '@/utils/errorMessage'

const ZodBodySchema = z
  .object({
    limit: z.coerce.number().optional(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    let auth = await requireRole(['admin'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin'])
      if (!auth.ok) return auth.response
    }
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const limitRaw = Number((body as Record<string, unknown>)?.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 20

    const admin = createAdminClient()

    const { data: exRows, error: exErr } = await admin
      .from('exercises')
      .select('name, video_url')
      .or('video_url.is.null,video_url.eq.')
      .limit(2000)

    if (exErr) return NextResponse.json({ ok: false, error: exErr.message }, { status: 400 })

    const normalizedToName = new Map<string, string>()
    for (const r of exRows || []) {
      const name = String((r as Record<string, unknown>)?.name || '').trim()
      if (!name) continue
      const normalized = normalizeExerciseName(name)
      if (!normalized) continue
      if (!normalizedToName.has(normalized)) normalizedToName.set(normalized, name)
      if (normalizedToName.size >= 1000) break
    }

    const normalizedNames = Array.from(normalizedToName.keys())
    if (!normalizedNames.length) {
      return NextResponse.json({ ok: true, processed: 0, created: 0, skipped: 0 })
    }

    const { data: existingLib } = await admin
      .from('exercise_library')
      .select('id, normalized_name, video_url')
      .in('normalized_name', normalizedNames)
      .limit(normalizedNames.length)

    const libByNormalized = new Map<string, { id: string; video_url: string | null }>()
    for (const r of existingLib || []) {
      const n = String((r as Record<string, unknown>)?.normalized_name || '').trim()
      const id = String((r as Record<string, unknown>)?.id || '').trim()
      if (!n || !id) continue
      const rawUrl = (r as Record<string, unknown>)?.video_url
      const video_url = typeof rawUrl === 'string' ? rawUrl : null
      libByNormalized.set(n, { id, video_url })
    }

    let processed = 0
    let created = 0
    let skipped = 0

    for (const normalized of normalizedNames) {
      if (processed >= limit) break

      const known = libByNormalized.get(normalized) || null
      if (known?.video_url) {
        skipped += 1
        continue
      }

      const name = normalizedToName.get(normalized) || normalized

      let exerciseLibraryId = known?.id || null
      if (!exerciseLibraryId) {
        const { data: libRow, error: libErr } = await admin
          .from('exercise_library')
          .upsert({ display_name_pt: name, normalized_name: normalized }, { onConflict: 'normalized_name' })
          .select('id')
          .single()
        if (libErr || !libRow?.id) {
          skipped += 1
          continue
        }
        exerciseLibraryId = libRow.id
      }

      const { data: existingVideos } = await admin
        .from('exercise_videos')
        .select('id')
        .eq('exercise_library_id', exerciseLibraryId)
        .limit(1)
      if ((existingVideos || []).length > 0) {
        skipped += 1
        continue
      }

      let queries: string[] = []
      try {
        queries = await getVideoQueriesFromGemini(name)
      } catch {
        queries = []
      }
      if (!queries.length) queries = [`${name} execução`, `${name} técnica`, `${name} how to`]

      const candidates: Array<{ videoId: string; url: string; title: string; channelTitle: string }> = []
      const seen = new Set<string>()

      for (const q of queries) {
        if (candidates.length >= 5) break
        const found = await searchYouTubeCandidates(q, 6)
        for (const it of found as any[]) {
          if (!it) continue
          const videoId = String((it as Record<string, unknown>).videoId || '').trim()
          if (!videoId || seen.has(videoId)) continue
          seen.add(videoId)
          candidates.push(it as any)
          if (candidates.length >= 5) break
        }
      }

      if (!candidates.length) {
        skipped += 1
        processed += 1
        continue
      }

      const rows = candidates.map((c) => ({
        exercise_library_id: exerciseLibraryId,
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

      const { data: inserted } = await admin
        .from('exercise_videos')
        .upsert(rows as any, { onConflict: 'exercise_library_id,provider,provider_video_id' })
        .select('id')

      created += Array.isArray(inserted) ? inserted.length : 0
      processed += 1
    }

    return NextResponse.json({ ok: true, processed, created, skipped })
  } catch (e: unknown) {
    const msg = getErrorMessage(e) ? String(getErrorMessage(e)) : String(e)
    const status = msg === 'missing_youtube_key' || msg === 'missing_gemini_key' ? 400 : 500
    return NextResponse.json({ ok: false, error: msg }, { status })
  }
}

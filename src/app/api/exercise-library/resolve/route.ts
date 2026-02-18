import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUser } from '@/utils/auth/route'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { parseJsonBody } from '@/utils/zod'

const ZodBodySchema = z
  .object({
    names: z.unknown().optional(),
    name: z.unknown().optional(),
  })
  .passthrough()

export async function POST(req: Request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  try {
    const parsedBody = await parseJsonBody(req, ZodBodySchema)
    if (parsedBody.response) return parsedBody.response
    const body = parsedBody.data!
    const rawNames = (body as Record<string, unknown>)?.names ?? (body as Record<string, unknown>)?.name ?? []
    const names = Array.isArray(rawNames) ? rawNames : [rawNames]

    const normalized = Array.from(
      new Set(
        names
          .map((n) => normalizeExerciseName(String(n || '')))
          .filter((n) => !!n)
          .slice(0, 100)
      )
    )

    if (!normalized.length) {
      return NextResponse.json({ ok: true, videos: {} })
    }

    const { data, error } = await auth.supabase
      .from('exercise_library')
      .select('normalized_name, video_url')
      .in('normalized_name', normalized)
      .limit(normalized.length)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const videos: Record<string, string> = {}
    for (const row of data || []) {
      const key = String((row as Record<string, unknown>)?.normalized_name || '').trim()
      const url = String((row as Record<string, unknown>)?.video_url || '').trim()
      if (key && url) videos[key] = url
    }

    return NextResponse.json({ ok: true, videos })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

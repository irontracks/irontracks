import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'

const QuerySchema = z.object({
  q: z.string().min(2, 'Busca deve ter ao menos 2 caracteres').max(100),
})

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: q, response } = parseSearchParams(request, QuerySchema)
    if (response) return response
    if (!q) return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 })

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('exercises')
      .select('id, name, video_url')
      .ilike('name', `%${q.q}%`)
      .order('name', { ascending: true })
      .limit(80)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const qNorm = normalizeExerciseName(q.q)
    const { data: libData } = await admin
      .from('exercise_library')
      .select('id, display_name_pt, video_url')
      .or(`display_name_pt.ilike.%${q.q}%,normalized_name.ilike.%${qNorm}%`)
      .order('display_name_pt', { ascending: true })
      .limit(40)

    const rows = Array.isArray(data) ? data : []
    const dedup = new Map<string, { id: string; name: string; video_url: string | null }>()
    for (const r of rows) {
      const name = String((r as Record<string, unknown>)?.name || '').trim()
      if (!name) continue
      const rawUrl = (r as Record<string, unknown>)?.video_url
      const video_url = typeof rawUrl === 'string' ? rawUrl : null
      const key = `${name.toLowerCase()}|${String(video_url || '').trim().toLowerCase()}`
      if (dedup.has(key)) continue
      const id = String((r as Record<string, unknown>)?.id || '')
      if (!id) continue
      dedup.set(key, { id, name, video_url })
      if (dedup.size >= 25) break
    }

    const libRows = Array.isArray(libData) ? libData : []
    for (const r of libRows) {
      if (dedup.size >= 25) break
      const name = String((r as Record<string, unknown>)?.display_name_pt || '').trim()
      if (!name) continue
      const rawUrl = (r as Record<string, unknown>)?.video_url
      const video_url = typeof rawUrl === 'string' ? rawUrl : null
      const key = `${name.toLowerCase()}|${String(video_url || '').trim().toLowerCase()}`
      if (dedup.has(key)) continue
      const id = String((r as Record<string, unknown>)?.id || '')
      if (!id) continue
      dedup.set(key, { id, name, video_url })
    }

    return NextResponse.json({ ok: true, items: Array.from(dedup.values()) })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

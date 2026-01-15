import { NextResponse } from 'next/server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const url = new URL(request.url)
    const qRaw = url.searchParams.get('q')
    const q = String(qRaw || '').trim()
    if (q.length < 2) return NextResponse.json({ ok: true, items: [] })

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('exercises')
      .select('id, name, video_url')
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .limit(80)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const qNorm = normalizeExerciseName(q)
    const { data: libData } = await admin
      .from('exercise_library')
      .select('id, display_name_pt, video_url')
      .or(`display_name_pt.ilike.%${q}%,normalized_name.ilike.%${qNorm}%`)
      .order('display_name_pt', { ascending: true })
      .limit(40)

    const rows = Array.isArray(data) ? data : []
    const dedup = new Map<string, { id: string; name: string; video_url: string | null }>()
    for (const r of rows) {
      const name = String((r as any)?.name || '').trim()
      if (!name) continue
      const video_url = (r as any)?.video_url ?? null
      const key = `${name.toLowerCase()}|${String(video_url || '').trim().toLowerCase()}`
      if (dedup.has(key)) continue
      const id = String((r as any)?.id || '')
      if (!id) continue
      dedup.set(key, { id, name, video_url })
      if (dedup.size >= 25) break
    }

    const libRows = Array.isArray(libData) ? libData : []
    for (const r of libRows) {
      if (dedup.size >= 25) break
      const name = String((r as any)?.display_name_pt || '').trim()
      if (!name) continue
      const video_url = (r as any)?.video_url ?? null
      const key = `${name.toLowerCase()}|${String(video_url || '').trim().toLowerCase()}`
      if (dedup.has(key)) continue
      const id = String((r as any)?.id || '')
      if (!id) continue
      dedup.set(key, { id, name, video_url })
    }

    return NextResponse.json({ ok: true, items: Array.from(dedup.values()) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

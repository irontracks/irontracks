import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseSearchParams } from '@/utils/zod'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizeExerciseName } from '@/utils/normalizeExerciseName'
import { cacheGet, cacheSet } from '@/utils/cache'

// Cache TTL: 120s (resultados de busca mudam raramente durante uma sessão)
const SEARCH_CACHE_TTL = 120
// HTTP header: browser pode usar por 60s e revalidar em background por mais 60s
const CACHE_CONTROL = 'private, max-age=60, stale-while-revalidate=60'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

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

    // Cache por usuário + query para evitar queries ILIKE repetidas a cada keystroke
    const cacheKey = `exercises:search:${user.id}:${q.q.toLowerCase().trim()}`
    const cached = await cacheGet<Record<string, unknown>>(cacheKey, (v) => (isRecord(v) ? v : null))
    if (cached) {
      return NextResponse.json(cached, { headers: { 'cache-control': CACHE_CONTROL } })
    }

    const admin = createAdminClient()

    // Strip PostgREST filter operators from user input to prevent injection
    const safeQ = q.q.replace(/[,()\\.]/g, '')

    const { data, error } = await admin
      .from('exercises')
      .select('id, name, video_url')
      .ilike('name', `%${safeQ}%`)
      .order('name', { ascending: true })
      .limit(80)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

    const qNorm = normalizeExerciseName(safeQ)
    const { data: libData } = await admin
      .from('exercise_library')
      .select('id, display_name_pt, video_url')
      .or(`display_name_pt.ilike.%${safeQ}%,normalized_name.ilike.%${qNorm}%`)
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

    const payload = { ok: true, items: Array.from(dedup.values()) }
    await cacheSet(cacheKey, payload, SEARCH_CACHE_TTL)
    return NextResponse.json(payload, { headers: { 'cache-control': CACHE_CONTROL } })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

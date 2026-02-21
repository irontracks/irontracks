import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/utils/supabase/server'
import { parseSearchParams } from '@/utils/zod'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  q: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { data: qParams, response } = parseSearchParams(req, QuerySchema)
    if (response) return response

    const search = qParams?.q?.trim() ?? ''
    const limit = qParams?.limit ?? 20

    let items: unknown[] = []

    let studentsQuery = supabase
      .from('students')
      .select('id, name, email, user_id, teacher_id')
      .eq('teacher_id', user.id)
      .order('name', { ascending: true })

    if (search) {
      studentsQuery = studentsQuery.ilike('name', `%${search}%`)
    }

    const { data: students, error: studentsError } = await studentsQuery
    if (studentsError) {
      throw studentsError
    }

    const studentsList = Array.isArray(students) ? students.filter((s) => s && s.user_id) : []

    const studentProfilesMap = new Map<string, any>()
    if (studentsList.length > 0) {
      const ids = studentsList.map((s) => s.user_id)
      const { data: spData } = await supabase
        .from('profiles')
        .select('id, last_seen, photo_url')
        .in('id', ids)

      if (spData) {
        for (const p of (spData as Record<string, unknown>[]) || []) {
          if (p && p.id) studentProfilesMap.set(String(p.id), p)
        }
      }
    }

    const studentItems = studentsList.map((s) => {
      const p = studentProfilesMap.get(String(s.user_id))
      return {
        id: s.user_id,
        displayName: s.name || s.email || 'Atleta',
        photoURL: p?.photo_url || null,
        lastSeen: p?.last_seen || null,
      }
    })

    items = studentItems

    const existingIds = new Set<string>()
    for (const s of studentsList) {
      if (s && s.user_id) {
        existingIds.add(String(s.user_id))
      }
    }

    let profilesQuery = supabase
      .from('profiles')
      .select('id, display_name, photo_url, last_seen')
      .order('last_seen', { ascending: false })
      .limit(limit)

    if (search) {
      profilesQuery = profilesQuery.ilike('display_name', `%${search}%`)
    }

    const { data: profiles, error: profilesError } = await profilesQuery
    if (profilesError) {
      throw profilesError
    }

    const profilesList = Array.isArray(profiles) ? profiles : []
    const profileItems = profilesList
      .filter((p) => p && p.id && p.id !== user.id && !existingIds.has(String(p.id)))
      .map((p) => ({
        id: p.id,
        displayName: p.display_name || '',
        photoURL: p.photo_url || null,
        lastSeen: p.last_seen || null,
      }))

    items = [...items, ...profileItems]

    return NextResponse.json({ ok: true, items })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const rawQ = url.searchParams.get('q') || ''
    const q = rawQ.trim()

    let items: any[] = []

    let studentsQuery = supabase
      .from('students')
      .select('id, name, email, user_id, teacher_id')
      .eq('teacher_id', user.id)
      .order('name', { ascending: true })

    if (q) {
      studentsQuery = studentsQuery.ilike('name', `%${q}%`)
    }

    const { data: students, error: studentsError } = await studentsQuery
    if (studentsError) {
      throw studentsError
    }

    const studentsList = Array.isArray(students)
      ? students.filter((s) => s && s.user_id)
      : []

    const studentItems = studentsList.map((s) => ({
      id: s.user_id,
      displayName: s.name || s.email || 'Atleta',
      photoURL: null,
      lastSeen: null,
    }))

    items = studentItems

    const existingIds = new Set<string>()
    for (const s of studentsList) {
      if (s && s.user_id) {
        existingIds.add(String(s.user_id))
      }
    }

    let profilesQuery: any = supabase
      .from('profiles')
      .select('id, display_name, photo_url, last_seen')
      .order('last_seen', { ascending: false })
      .limit(40)

    if (q) {
      profilesQuery = profilesQuery.ilike('display_name', `%${q}%`)
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
  } catch (e: any) {
    const message = e?.message ?? String(e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

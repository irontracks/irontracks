import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await request.json()
    const session = body?.session
    if (!session) return NextResponse.json({ ok: false, error: 'missing session' }, { status: 400 })

    const { data, error } = await supabase
      .from('workouts')
      .insert({
        user_id: user.id,
        created_by: user.id,
        name: session.workoutTitle || 'Treino Realizado',
        date: new Date(session?.date ?? new Date()),
        is_template: false,
        notes: JSON.stringify(session)
      })
      .select('id, created_at')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, saved: data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}


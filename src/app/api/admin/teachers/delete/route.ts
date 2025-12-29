import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    const admin = createAdminClient()
    const body = await req.json()
    const { id } = body || {}
    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    // Resolve teacher row
    const { data: t } = await admin.from('teachers').select('id,email,user_id').eq('id', id).maybeSingle()
    if (!t) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    const authId = t.user_id || null

    // Cascade delete workouts created by this teacher
    if (authId) {
      const { data: w } = await admin.from('workouts').select('id').eq('created_by', authId)
      const wids = (w||[]).map(x=>x.id)
      for (const wid of wids) {
        const { data: exs } = await admin.from('exercises').select('id').eq('workout_id', wid)
        const exIds = (exs||[]).map(e=>e.id)
        if (exIds.length>0) await admin.from('sets').delete().in('exercise_id', exIds)
        await admin.from('exercises').delete().eq('workout_id', wid)
        await admin.from('workouts').delete().eq('id', wid)
      }
    }

    // Delete teacher
    const { error } = await admin.from('teachers').delete().eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

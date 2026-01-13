import { NextResponse } from 'next/server'
import { requireRole } from '@/utils/auth/route'

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const supabase = auth.supabase

    const body = await req.json()
    const { id } = body || {}
    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const { data: w } = await supabase.from('workouts').select('id, is_template').eq('id', id).maybeSingle()
    if (!w?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
    if (w?.is_template !== true) return NextResponse.json({ ok: false, error: 'refuse_non_template' }, { status: 400 })

    const { error } = await supabase.from('workouts').delete().eq('id', id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

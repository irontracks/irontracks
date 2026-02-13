import { NextResponse } from 'next/server'
import { requireRole, requireRoleWithBearer } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    let auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) {
      auth = await requireRoleWithBearer(req, ['admin', 'teacher'])
      if (!auth.ok) return auth.response
    }

    const url = new URL(req.url)
    const id = url.searchParams.get('id') || undefined
    const email = url.searchParams.get('email') || undefined

    const supabase = auth.supabase

    // Resolve to profiles.id (auth uid)
    let targetUserId = ''
    let resolvedEmail = String(email || '').trim()
    if (id) {
      const { data: sById } = await supabase.from('students').select('user_id, email').eq('id', id).maybeSingle()
      targetUserId = sById?.user_id || ''
      if (!resolvedEmail && sById?.email) resolvedEmail = String(sById.email || '').trim()
      if (!targetUserId) {
        const { data: pById } = await supabase.from('profiles').select('id').eq('id', id).maybeSingle()
        targetUserId = pById?.id || ''
      }
    }
    if (!targetUserId && resolvedEmail) {
      const { data: pByEmail } = await supabase.from('profiles').select('id').ilike('email', resolvedEmail).maybeSingle()
      targetUserId = pByEmail?.id || ''
      if (!targetUserId) {
        const { data: sByEmail } = await supabase.from('students').select('id, user_id').ilike('email', resolvedEmail).maybeSingle()
        if (sByEmail?.id && !sByEmail?.user_id) {
          return NextResponse.json({ ok: false, error: 'Aluno sem conta (user_id).' }, { status: 400 })
        }
        targetUserId = sByEmail?.user_id || ''
      }
    }
    if (!targetUserId) return NextResponse.json({ ok: false, error: 'missing target' }, { status: 400 })

    try {
      const { data: maybeProfile } = await supabase.from('profiles').select('id').eq('id', targetUserId).maybeSingle()
      if (!maybeProfile?.id) {
        return NextResponse.json({ ok: false, error: 'Aluno sem conta (user_id).' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'Falha ao validar aluno' }, { status: 400 })
    }

    if (auth.role === 'teacher') {
      const { data: link } = await supabase
        .from('students')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('teacher_id', auth.user.id)
        .maybeSingle()
      if (!link?.id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }

    const { data: rows } = await supabase
      .from('workouts')
      .select('*, exercises(*, sets(*))')
      .eq('user_id', targetUserId)
      .eq('is_template', true)
      .order('name')

    return NextResponse.json({ ok: true, rows: rows || [] })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response

    const url = new URL(req.url)
    const id = url.searchParams.get('id') || undefined
    const email = url.searchParams.get('email') || undefined

    const admin = createAdminClient()

    // Resolve to profiles.id (auth uid)
    let targetUserId = ''
    let resolvedEmail = String(email || '').trim()
    if (id) {
      const { data: sById } = await admin.from('students').select('user_id, email').eq('id', id).maybeSingle()
      targetUserId = sById?.user_id || ''
      if (!resolvedEmail && sById?.email) resolvedEmail = String(sById.email || '').trim()
      if (!targetUserId) {
        const { data: pById } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
        targetUserId = pById?.id || ''
      }
    }
    if (!targetUserId && resolvedEmail) {
      const { data: pByEmail } = await admin.from('profiles').select('id').ilike('email', resolvedEmail).maybeSingle()
      targetUserId = pByEmail?.id || ''
      if (!targetUserId) {
        const { data: sByEmail } = await admin.from('students').select('user_id').ilike('email', resolvedEmail).maybeSingle()
        targetUserId = sByEmail?.user_id || ''
      }
    }
    if (!targetUserId) return NextResponse.json({ ok: false, error: 'missing target' }, { status: 400 })

    try {
      const { data: maybeProfile } = await admin.from('profiles').select('id').eq('id', targetUserId).maybeSingle()
      if (!maybeProfile?.id) {
        return NextResponse.json({ ok: false, error: 'Aluno sem conta (user_id).' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'Falha ao validar aluno' }, { status: 400 })
    }

    const { data: rows } = await admin
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

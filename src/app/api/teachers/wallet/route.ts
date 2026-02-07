import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export const dynamic = 'force-dynamic'

const isMissingColumn = (err: any, column: string) => {
  const msg = String(err?.message || '').toLowerCase()
  return msg.includes(column.toLowerCase()) && (msg.includes('could not find') || msg.includes('column'))
}

const canUseWalletFields = (err: any) => {
  return !isMissingColumn(err, 'asaas_wallet_id') && !isMissingColumn(err, 'asaas_account_id') && !isMissingColumn(err, 'asaas_account_status')
}

export async function GET() {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const user = auth.user
    const normalizedEmail = String(user.email || '').toLowerCase().trim()

    const admin = createAdminClient()

    const escapedEmailForLike = normalizedEmail.replace(/([%_\\])/g, '\\$1')

    const selectFull = 'id, email, user_id, asaas_wallet_id, asaas_account_id, asaas_account_status'
    const selectFallback = 'id, email, user_id'

    const fetchByUserId = async (select: string) => {
      return await admin
        .from('teachers')
        .select(select)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    const fetchByEmail = async (select: string) => {
      return await admin
        .from('teachers')
        .select(select)
        .ilike('email', escapedEmailForLike)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    let teacher: any | null = null

    let byUser = await fetchByUserId(selectFull)
    if (byUser?.error && !canUseWalletFields(byUser.error)) byUser = await fetchByUserId(selectFallback)
    teacher = byUser?.data || null

    if (teacher && normalizedEmail) {
      const rowEmail = String(teacher?.email || '').toLowerCase().trim()
      if (rowEmail && rowEmail !== normalizedEmail) teacher = null
    }

    if (!teacher && normalizedEmail) {
      let byEmail = await fetchByEmail(selectFull)
      if (byEmail?.error && !canUseWalletFields(byEmail.error)) byEmail = await fetchByEmail(selectFallback)
      teacher = byEmail?.data || null
    }

    if (teacher?.id && !teacher?.user_id) {
      const rowEmail = String(teacher?.email || '').toLowerCase().trim()
      if (rowEmail && normalizedEmail && rowEmail === normalizedEmail) {
        await admin.from('teachers').update({ user_id: user.id }).eq('id', teacher.id)
        teacher = { ...(teacher || {}), user_id: user.id }
      }
    }

    return NextResponse.json({ ok: true, teacher: teacher || null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin', 'teacher'])
    if (!auth.ok) return auth.response
    const user = auth.user
    const normalizedEmail = String(user.email || '').toLowerCase().trim()

    const admin = createAdminClient()

    const body = await req.json().catch(() => ({} as any))
    const walletId = String(body?.asaas_wallet_id || body?.walletId || '').trim()
    if (!walletId) return NextResponse.json({ ok: false, error: 'missing_wallet_id' }, { status: 400 })

    const escapedEmailForLike = normalizedEmail.replace(/([%_\\])/g, '\\$1')

    const selectFull = 'id, email, user_id, asaas_wallet_id, asaas_account_id, asaas_account_status'
    const selectFallback = 'id, email, user_id'

    const fetchByUserId = async (select: string) => {
      return await admin
        .from('teachers')
        .select(select)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    const fetchByEmail = async (select: string) => {
      return await admin
        .from('teachers')
        .select(select)
        .ilike('email', escapedEmailForLike)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    }

    let teacherRow: any | null = null

    let byUser = await fetchByUserId(selectFull)
    if (byUser?.error && !canUseWalletFields(byUser.error)) byUser = await fetchByUserId(selectFallback)
    teacherRow = byUser?.data || null

    if (!teacherRow && normalizedEmail) {
      let byEmail = await fetchByEmail(selectFull)
      if (byEmail?.error && !canUseWalletFields(byEmail.error)) byEmail = await fetchByEmail(selectFallback)
      teacherRow = byEmail?.data || null
    }

    if (!teacherRow) {
      const { data: profile } = await admin.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      const payload: any = {
        email: normalizedEmail,
        name: String(profile?.display_name || normalizedEmail).trim(),
        status: 'active',
        user_id: user.id,
        asaas_wallet_id: walletId,
      }
      const { data: inserted, error: insertErr } = await admin.from('teachers').insert(payload).select(selectFull).single()
      if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 400 })
      return NextResponse.json({ ok: true, teacher: inserted })
    }

    const updates: any = {
      asaas_wallet_id: walletId,
    }
    if (!teacherRow.user_id) updates.user_id = user.id
    if (!String(teacherRow.email || '').trim()) updates.email = normalizedEmail

    const { data: updated, error: updateErr } = await admin
      .from('teachers')
      .update(updates)
      .eq('id', teacherRow.id)
      .select(selectFull)
      .single()
    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, teacher: updated })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

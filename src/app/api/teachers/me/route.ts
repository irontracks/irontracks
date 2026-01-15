import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    const admin = createAdminClient()
    const normalizedEmail = String(user.email || '').toLowerCase().trim()
    const escapedEmailForLike = normalizedEmail.replace(/([%_\\])/g, '\\$1')

    const normalizeTeacherStatus = (value: any) => {
      const s = String(value || '').toLowerCase().trim()
      if (!s) return 'pending'
      if (['pago', 'paid', 'paid_out', 'paidout'].includes(s)) return 'active'
      if (['ativo', 'active'].includes(s)) return 'active'
      if (['atrasado', 'overdue', 'late', 'em atraso'].includes(s)) return 'pending'
      if (['pendente', 'pending'].includes(s)) return 'pending'
      if (['cancelar', 'cancelled', 'canceled', 'suspended', 'inactive', 'inativo'].includes(s)) return 'cancelled'
      return s
    }

    const selectFull = 'status, payment_status, email, id, name, phone, birth_date, user_id, created_at'
    const selectFallback = 'status, payment_status, email, id, name, phone, user_id, created_at'
    const shouldFallback = (err: any) => {
      const msg = String(err?.message || '').toLowerCase()
      return msg.includes('birth_date') || msg.includes("could not find the 'birth_date' column")
    }

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

    let data: any | null = null
    let byUser = await fetchByUserId(selectFull)
    if (byUser?.error && shouldFallback(byUser.error)) byUser = await fetchByUserId(selectFallback)
    data = byUser?.data || null
    if (data && normalizedEmail) {
      const rowEmail = String(data?.email || '').toLowerCase().trim()
      if (rowEmail && rowEmail !== normalizedEmail) {
        data = null
      }
    }

    if (!data && normalizedEmail) {
      let byEmail = await fetchByEmail(selectFull)
      if (byEmail?.error && shouldFallback(byEmail.error)) byEmail = await fetchByEmail(selectFallback)
      data = byEmail?.data || null
    }

    if (data?.id && !data?.user_id) {
      const rowEmail = String(data?.email || '').toLowerCase().trim()
      if (rowEmail && normalizedEmail && rowEmail === normalizedEmail) {
        await admin.from('teachers').update({ user_id: user.id }).eq('id', data.id)
        data = { ...data, user_id: user.id }
      }
    }

    if (data) {
      const bestEffortStatus = normalizeTeacherStatus(data.status || data.payment_status)
      data = { ...data, status: bestEffortStatus }
    }

    return NextResponse.json({ ok: true, teacher: data || null })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

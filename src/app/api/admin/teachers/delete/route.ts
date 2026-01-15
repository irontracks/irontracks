import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { requireRole } from '@/utils/auth/route'

export async function POST(req: Request) {
  try {
    const auth = await requireRole(['admin'])
    if (!auth.ok) return auth.response
    const admin = createAdminClient()
    const body = await req.json()
    const { id } = body || {}
    if (!id) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })

    const { data: t } = await admin.from('teachers').select('id,status').eq('id', id).maybeSingle()
    if (!t?.id) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })

    const { error } = await admin
      .from('teachers')
      .update({
        status: 'cancelled',
        asaas_wallet_id: null,
        asaas_account_id: null,
        asaas_account_status: null,
      })
      .eq('id', id)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, soft_deleted: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

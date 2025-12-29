import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { asaasRequest } from '@/lib/asaas'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'djmkapple@gmail.com'

const parseNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const raw = String(value ?? '').trim().replace(/\./g, '').replace(',', '.')
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || (user.email || '').toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const action = String(body?.action || '').trim().toLowerCase()
    const createSubaccount = action === 'create_subaccount' || body?.create_subaccount === true

    const teacherId = (body?.teacher_id || body?.id || '') as string
    let teacherUserId = (body?.user_id || '') as string
    const rawEmail = (body?.email || '') as string
    const email = rawEmail.toLowerCase().trim()

    const walletId = ((body?.asaas_wallet_id || body?.walletId || '') as string).trim()
    const asaasAccountId = ((body?.asaas_account_id || body?.asaasAccountId || '') as string).trim()
    const asaasAccountStatus = ((body?.asaas_account_status || body?.asaasAccountStatus || '') as string).trim()

    if (!teacherId && !teacherUserId && !email) {
      return NextResponse.json({ ok: false, error: 'missing_teacher_identifier' }, { status: 400 })
    }
    if (!createSubaccount && !walletId) {
      return NextResponse.json({ ok: false, error: 'missing_wallet_id' }, { status: 400 })
    }

    const admin = createAdminClient()

    let resolvedName: string | null = null
    if (!String(teacherUserId || '').trim() && email) {
      const { data: profile } = await admin
        .from('profiles')
        .select('id, display_name')
        .ilike('email', email)
        .maybeSingle()
      if (profile?.id) teacherUserId = profile.id
      resolvedName = (profile?.display_name || null) as string | null
    }

    let teacherRow: any | null = null
    if (teacherId) {
      const { data } = await admin.from('teachers').select('id, email, user_id, asaas_wallet_id').eq('id', teacherId).maybeSingle()
      teacherRow = data || null
    }

    if (!teacherRow && teacherUserId) {
      const { data } = await admin.from('teachers').select('id, email, user_id, asaas_wallet_id').eq('user_id', teacherUserId).maybeSingle()
      teacherRow = data || null
    }

    if (!teacherRow && email) {
      const { data } = await admin.from('teachers').select('id, email, user_id, asaas_wallet_id').ilike('email', email).maybeSingle()
      teacherRow = data || null
    }

    if (!teacherRow) {
      let resolvedEmail = email
      let resolvedUserId: string | null = teacherUserId || null

      if (resolvedUserId && !resolvedEmail) {
        const { data: profile } = await admin
          .from('profiles')
          .select('email, display_name')
          .eq('id', resolvedUserId)
          .maybeSingle()
        resolvedEmail = ((profile?.email || '') as string).toLowerCase().trim()
        resolvedName = (profile?.display_name || null) as string | null
      }

      if (!resolvedEmail) {
        return NextResponse.json({ ok: false, error: 'teacher_email_required' }, { status: 400 })
      }

      const payload: any = {
        email: resolvedEmail,
        name: resolvedName || resolvedEmail,
        status: 'active',
      }
      if (resolvedUserId) payload.user_id = resolvedUserId

      const { data: inserted, error: insertErr } = await admin
        .from('teachers')
        .insert(payload)
        .select('id, email, user_id, asaas_wallet_id')
        .single()
      if (insertErr || !inserted) {
        let existing: any | null = null
        if (resolvedUserId) {
          const { data } = await admin
            .from('teachers')
            .select('id, email, user_id, asaas_wallet_id')
            .eq('user_id', resolvedUserId)
            .maybeSingle()
          existing = data || null
        }
        if (!existing) {
          const { data } = await admin
            .from('teachers')
            .select('id, email, user_id, asaas_wallet_id')
            .ilike('email', resolvedEmail)
            .maybeSingle()
          existing = data || null
        }
        if (!existing) {
          return NextResponse.json({ ok: false, error: insertErr?.message || 'failed_to_insert_teacher' }, { status: 400 })
        }
        teacherRow = existing
      } else {
        teacherRow = inserted
      }
    }

    if (createSubaccount) {
      const teacherAlreadyHasWallet = String(teacherRow?.asaas_wallet_id || '').trim()
      if (teacherAlreadyHasWallet) {
        const { data: existingTeacher } = await admin
          .from('teachers')
          .select('id, email, user_id, asaas_wallet_id, asaas_account_id, asaas_account_status')
          .eq('id', teacherRow.id)
          .maybeSingle()
        return NextResponse.json({ ok: true, teacher: existingTeacher || teacherRow })
      }

      const accountName = String(body?.name || body?.fullName || body?.display_name || teacherRow?.name || '').trim()
      const cpfCnpj = String(body?.cpfCnpj || body?.cpf_cnpj || '').trim()
      const birthDate = String(body?.birthDate || body?.birth_date || '').trim()
      const companyType = String(body?.companyType || body?.company_type || '').trim()
      const phone = String(body?.phone || '').trim()
      const mobilePhone = String(body?.mobilePhone || body?.mobile_phone || '').trim()
      const address = String(body?.address || '').trim()
      const addressNumber = String(body?.addressNumber || body?.address_number || '').trim()
      const complement = String(body?.complement || '').trim()
      const province = String(body?.province || '').trim()
      const postalCode = String(body?.postalCode || body?.postal_code || '').trim()
      const incomeValue = parseNumber(body?.incomeValue ?? body?.income_value)

      if (!email) return NextResponse.json({ ok: false, error: 'teacher_email_required' }, { status: 400 })
      if (!accountName) return NextResponse.json({ ok: false, error: 'missing_name' }, { status: 400 })
      if (!cpfCnpj) return NextResponse.json({ ok: false, error: 'missing_cpf_cnpj' }, { status: 400 })
      if (!mobilePhone) return NextResponse.json({ ok: false, error: 'missing_mobile_phone' }, { status: 400 })
      if (!postalCode) return NextResponse.json({ ok: false, error: 'missing_postal_code' }, { status: 400 })
      if (!address) return NextResponse.json({ ok: false, error: 'missing_address' }, { status: 400 })
      if (!addressNumber) return NextResponse.json({ ok: false, error: 'missing_address_number' }, { status: 400 })
      if (!province) return NextResponse.json({ ok: false, error: 'missing_province' }, { status: 400 })
      if (incomeValue === null || incomeValue <= 0) return NextResponse.json({ ok: false, error: 'missing_income_value' }, { status: 400 })

      const created = await asaasRequest<any>({
        method: 'POST',
        path: '/accounts',
        body: {
          name: accountName,
          email,
          cpfCnpj,
          birthDate: birthDate || undefined,
          companyType: companyType || undefined,
          phone: phone || undefined,
          mobilePhone,
          address,
          addressNumber,
          complement: complement || undefined,
          province,
          postalCode,
          incomeValue,
        },
      })

      const createdWalletId = String(created?.walletId || created?.wallet_id || '').trim()
      const createdAccountId = String(created?.id || created?.accountId || '').trim()
      const createdStatus = String(created?.status || created?.accountStatus || '').trim()

      if (!createdWalletId) {
        return NextResponse.json({ ok: false, error: 'asaas_wallet_id_missing_in_response' }, { status: 502 })
      }

      const updates: any = {
        asaas_wallet_id: createdWalletId,
      }
      if (createdAccountId) updates.asaas_account_id = createdAccountId
      if (createdStatus) updates.asaas_account_status = createdStatus
      if (teacherUserId && !teacherRow.user_id) updates.user_id = teacherUserId
      if (email && !String(teacherRow?.email || '').trim()) updates.email = email

      const { data: updated, error: updateErr } = await admin
        .from('teachers')
        .update(updates)
        .eq('id', teacherRow.id)
        .select('id, email, user_id, asaas_wallet_id, asaas_account_id, asaas_account_status')
        .single()
      if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 })

      return NextResponse.json({ ok: true, teacher: updated })
    }

    const updates: any = {
      asaas_wallet_id: walletId,
    }
    if (teacherUserId && !teacherRow.user_id) updates.user_id = teacherUserId
    if (asaasAccountId) updates.asaas_account_id = asaasAccountId
    if (asaasAccountStatus) updates.asaas_account_status = asaasAccountStatus
    if (email && !String(teacherRow?.email || '').trim()) updates.email = email

    const { data: updated, error: updateErr } = await admin
      .from('teachers')
      .update(updates)
      .eq('id', teacherRow.id)
      .select('id, email, user_id, asaas_wallet_id, asaas_account_id, asaas_account_status')
      .single()
    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, teacher: updated })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 })
  }
}

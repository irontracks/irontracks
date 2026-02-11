import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    const code = String(body?.code || '').trim()
    const password = String(body?.password || '').trim()

    if (!email || !isValidEmail(email) || !code || password.length < 6) {
      return NextResponse.json({ ok: false, error: 'Dados inválidos.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (profileError || !profile?.id) {
      return NextResponse.json({ ok: false, error: 'Código inválido.' }, { status: 400 })
    }

    const { data: validCode, error: verifyError } = await admin.rpc('verify_recovery_code_admin', {
      p_user_id: profile.id,
      p_code: code,
    })

    if (verifyError || validCode !== true) {
      return NextResponse.json({ ok: false, error: 'Código inválido.' }, { status: 400 })
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, { password })
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message || 'Falha ao atualizar senha.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno.' }, { status: 500 })
  }
}


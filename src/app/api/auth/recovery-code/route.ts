import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), z.string().email()),
    code: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().min(1)),
    password: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().min(6)),
  })
  .passthrough()

export async function POST(request: Request) {
  try {
    const parsedBody = await parseJsonBody(request, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { email, code, password } = parsedBody.data!

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

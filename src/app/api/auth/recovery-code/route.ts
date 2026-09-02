import { NextResponse } from 'next/server'
import { respondInternalError } from '@/utils/api/internalError'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { respondDbError } from '@/utils/api/dbError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    email: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), z.string().email()),
    code: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().min(1)),
    password: z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().min(8)),
  })
  .strip()

export async function POST(request: Request) {
  try {
    const ip = getRequestIp(request)
    const rlIp = await checkRateLimitAsync(`recovery:ip:${ip}`, 20, 15 * 60_000)
    if (!rlIp.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Muitas tentativas. Aguarde antes de tentar novamente.' },
        { status: 429, headers: { 'Retry-After': String(rlIp.retryAfterSeconds) } }
      )
    }

    const parsedBody = await parseJsonBody(request, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { email, code, password } = parsedBody.data!

    const rlEmail = await checkRateLimitAsync(`recovery:email:${email}`, 5, 15 * 60_000)
    if (!rlEmail.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Muitas tentativas para este e-mail. Aguarde 15 minutos.' },
        { status: 429, headers: { 'Retry-After': String(rlEmail.retryAfterSeconds) } }
      )
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
      return respondDbError('api:auth:recovery-code', updateError)
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return respondInternalError('api:auth:recovery-code', e)
  }
}

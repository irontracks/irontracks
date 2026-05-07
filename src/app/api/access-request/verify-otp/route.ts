/**
 * POST /api/access-request/verify-otp
 *
 * Validates an OTP code for a given phone number.
 * On success, returns a one-time `token` (UUID) that must be sent when creating
 * the access request to prove the phone was verified.
 *
 * Max 5 attempts per verification record before it is locked.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { normalizeBrPhone } from '@/lib/whatsapp/zapi'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError, logWarn } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  phone: z.string().min(1),
  code: z.string().length(6),
}).strip()

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req)
    const ipRl = await checkRateLimitAsync(`otp:verify:ip:${ip}`, 20, 60_000)
    if (!ipRl.allowed) {
      return NextResponse.json({ ok: false, error: 'Muitas tentativas.' }, { status: 429 })
    }

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { phone: rawPhone, code } = parsed.data!

    const phone = normalizeBrPhone(rawPhone)
    if (!phone) {
      return NextResponse.json({ ok: false, error: 'Telefone inválido.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Find the most recent unexpired, unverified record for this phone
    const { data: record } = await admin
      .from('phone_verifications')
      .select('id, otp_code, attempts, expires_at, verified')
      .eq('phone', phone)
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!record) {
      return NextResponse.json(
        { ok: false, error: 'Código expirado ou não encontrado. Solicite um novo.' },
        { status: 400 },
      )
    }

    const attempts = Number(record.attempts ?? 0)
    if (attempts >= 5) {
      logWarn('access-request/verify-otp', 'Max attempts exceeded', { phone: `****${phone.slice(-4)}` })
      return NextResponse.json(
        { ok: false, error: 'Número máximo de tentativas atingido. Solicite um novo código.' },
        { status: 400 },
      )
    }

    if (code !== String(record.otp_code)) {
      // Increment attempts
      await admin
        .from('phone_verifications')
        .update({ attempts: attempts + 1 })
        .eq('id', String(record.id))

      const remaining = 4 - attempts
      return NextResponse.json(
        { ok: false, error: `Código incorreto. ${remaining > 0 ? `${remaining} tentativa(s) restante(s).` : 'Solicite um novo código.'}` },
        { status: 400 },
      )
    }

    // Code is correct — generate a one-time verify token
    const verifyToken = crypto.randomUUID()

    await admin
      .from('phone_verifications')
      .update({
        verified: true,
        verify_token: verifyToken,
        verified_at: new Date().toISOString(),
      })
      .eq('id', String(record.id))

    return NextResponse.json({ ok: true, token: verifyToken })
  } catch (e) {
    logError('access-request/verify-otp', e)
    return NextResponse.json({ ok: false, error: 'Erro interno.' }, { status: 500 })
  }
}

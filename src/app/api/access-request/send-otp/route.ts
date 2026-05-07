/**
 * POST /api/access-request/send-otp
 *
 * Generates a 6-digit OTP, stores it in phone_verifications, and sends it
 * via WhatsApp (Z-API) to the given phone number.
 *
 * Rate limit: max 3 sends per phone per 10 minutes.
 * OTP expires in 10 minutes.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { normalizeBrPhone, sendWhatsAppText } from '@/lib/whatsapp/zapi'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  phone: z.string().min(1),
}).strip()

function generateOtp(): string {
  try {
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    return String(arr[0] % 1_000_000).padStart(6, '0')
  } catch {
    return String(Math.floor(100_000 + Math.random() * 900_000))
  }
}

export async function POST(req: Request) {
  try {
    // IP-based rate limit: max 10 sends per minute (defense against automation)
    const ip = getRequestIp(req)
    const ipRl = await checkRateLimitAsync(`otp:send:ip:${ip}`, 10, 60_000)
    if (!ipRl.allowed) {
      return NextResponse.json({ ok: false, error: 'Muitas tentativas. Aguarde um momento.' }, { status: 429 })
    }

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { phone: rawPhone } = parsed.data!

    const phone = normalizeBrPhone(rawPhone)
    if (!phone) {
      return NextResponse.json({ ok: false, error: 'Telefone inválido. Use (DDD) + número.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Phone-level rate limit: max 3 OTPs per phone per 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString()
    const { count } = await admin
      .from('phone_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', tenMinAgo)

    if ((count ?? 0) >= 3) {
      return NextResponse.json(
        { ok: false, error: 'Muitos códigos enviados. Aguarde 10 minutos antes de tentar novamente.' },
        { status: 429 },
      )
    }

    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()

    await admin.from('phone_verifications').insert({
      phone,
      otp_code: otp,
      expires_at: expiresAt,
    })

    const message =
      `🔐 *IronTracks* — Código de verificação:\n\n` +
      `*${otp}*\n\n` +
      `Válido por 10 minutos. Não compartilhe com ninguém.`

    await sendWhatsAppText(phone, message)

    return NextResponse.json({ ok: true })
  } catch (e) {
    logError('access-request/send-otp', e)
    return NextResponse.json({ ok: false, error: 'Erro interno.' }, { status: 500 })
  }
}

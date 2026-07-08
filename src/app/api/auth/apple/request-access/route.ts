import { NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/utils/zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { notifyAdminNewSignup } from '@/lib/admin/adminNotifications'
import { logError } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  token: z.string().min(20),
  full_name: z.string().optional(),
})

const APPLE_ISS = 'https://appleid.apple.com'
const EXPECTED_AUD = new Set(
  [
    process.env.APPLE_IOS_CLIENT_ID,
    process.env.NEXT_PUBLIC_APPLE_IOS_CLIENT_ID,
    'com.irontracks.app',
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean),
)

/**
 * Decodifica (SEM verificar assinatura) o payload do identityToken da Apple.
 * Mesma filosofia do decodeAppleEmailFromToken: criar uma SOLICITAÇÃO PENDENTE de
 * acesso não concede acesso (o admin ainda aprova, e o Supabase valida a
 * assinatura do JWT no signInWithIdToken). Validamos iss/aud/exp pra reduzir
 * ruído; a segurança real fica no signInWithIdToken + aprovação do admin.
 */
function decodeApplePayload(token: string): Record<string, unknown> | null {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(b64, 'base64').toString('utf8')
    const payload = JSON.parse(json)
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`apple_request_access:${ip}`, 8, 60_000)
    if (!rl.allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

    const parsed = await parseJsonBody(req, BodySchema)
    if (parsed.response) return parsed.response
    const { token, full_name } = parsed.data!

    const payload = decodeApplePayload(token)
    if (!payload) return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 400 })

    // Validações de claim (defesa; a assinatura é validada pelo Supabase no login).
    if (String(payload.iss || '') !== APPLE_ISS) {
      return NextResponse.json({ ok: false, error: 'invalid_issuer' }, { status: 400 })
    }
    const aud = payload.aud
    const audOk = Array.isArray(aud)
      ? aud.some((a) => EXPECTED_AUD.has(String(a)))
      : EXPECTED_AUD.has(String(aud || ''))
    if (!audOk) return NextResponse.json({ ok: false, error: 'invalid_audience' }, { status: 400 })
    const exp = Number(payload.exp || 0)
    if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
      return NextResponse.json({ ok: false, error: 'expired_token' }, { status: 400 })
    }

    const email = String(payload.email || '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, error: 'missing_email' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Já é aluno/professor/admin ou já tem perfil → não cria solicitação.
    const [{ data: student }, { data: teacher }, { data: profile }] = await Promise.all([
      admin.from('students').select('id').ilike('email', email).maybeSingle(),
      admin.from('teachers').select('id').ilike('email', email).maybeSingle(),
      admin.from('profiles').select('id').ilike('email', email).maybeSingle(),
    ])
    if (student?.id || teacher?.id || profile?.id) {
      return NextResponse.json({ ok: true, status: 'existed' })
    }

    // Já tem solicitação?
    const { data: existingReq } = await admin
      .from('access_requests')
      .select('id, status')
      .ilike('email', email)
      .maybeSingle()
    if (existingReq?.id) {
      const st = String(existingReq.status || '')
      if (st === 'approved' || st === 'accepted') return NextResponse.json({ ok: true, status: 'approved' })
      // pending/rejected → garante pendente (reabre rejeitada) e segue.
      if (st === 'rejected') {
        await admin.from('access_requests').update({ status: 'pending', updated_at: new Date().toISOString() }).eq('id', existingReq.id)
      }
      return NextResponse.json({ ok: true, status: 'requested' })
    }

    const safeName =
      String(full_name || '').trim() ||
      String(payload.email || '').split('@')[0]?.replace(/[^a-zA-Z0-9\s._-]/g, '').trim() ||
      'Usuário Apple'

    const { error } = await admin
      .from('access_requests')
      .insert({ email, full_name: safeName, phone: null, role_requested: 'student', status: 'pending', phone_verified: false })

    if (error) {
      logError('auth:apple:request-access', error)
      return NextResponse.json({ ok: false, error: 'insert_failed' }, { status: 400 })
    }

    notifyAdminNewSignup({ name: safeName, email, role: 'student' }).catch(() => { })

    return NextResponse.json({ ok: true, status: 'requested' })
  } catch (e) {
    logError('auth:apple:request-access', e)
    return NextResponse.json({ ok: false, error: 'unexpected_error' }, { status: 500 })
  }
}

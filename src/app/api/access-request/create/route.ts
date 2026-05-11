import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { normalizeBrPhone } from '@/lib/whatsapp/zapi'
import { logError } from '@/lib/logger'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'
import { env } from '@/utils/env'
import { notifyAdminNewSignup } from '@/lib/admin/adminNotifications'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    email: z.string().min(1),
    phone: z.string().min(1),
    full_name: z.string().min(1),
    birth_date: z.string().optional().nullable(),
    role_requested: z.string().optional().nullable(),
    cref: z.string().optional().nullable(),
    /** One-time token returned by /api/access-request/verify-otp */
    phone_verified_token: z.string().optional().nullable(),
  })
  .strip()

/** Returns true when Z-API is configured — phone verification is enforced in production. */
function zapiEnabled(): boolean {
  return Boolean(env.zapi.instanceId && env.zapi.token)
}

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`access_request:${ip}`, 10, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { email, phone, full_name, birth_date, role_requested, cref, phone_verified_token } = parsedBody.data!

    // ── Validation ────────────────────────────────────────────────────────────

    if (!email || !full_name || !phone) {
      return NextResponse.json({ ok: false, error: 'Nome, e-mail e telefone são obrigatórios.' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ ok: false, error: 'E-mail inválido.' }, { status: 400 })
    }

    const normalizedPhone = normalizeBrPhone(phone)
    if (!normalizedPhone) {
      return NextResponse.json({ ok: false, error: 'Telefone inválido (DDD + número).' }, { status: 400 })
    }

    if (role_requested === 'teacher' && !cref) {
      return NextResponse.json({ ok: false, error: 'CREF é obrigatório para cadastro de professor.' }, { status: 400 })
    }

    // ── Phone verification check ──────────────────────────────────────────────

    const supabaseAdmin = createAdminClient()
    let phoneVerified = false

    if (zapiEnabled()) {
      if (!phone_verified_token) {
        return NextResponse.json(
          { ok: false, error: 'Confirme seu WhatsApp antes de enviar o cadastro.' },
          { status: 400 },
        )
      }

      // Validate the token against phone_verifications
      const { data: verif } = await supabaseAdmin
        .from('phone_verifications')
        .select('id, phone, verified, expires_at')
        .eq('verify_token', phone_verified_token)
        .eq('verified', true)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      if (!verif || verif.phone !== normalizedPhone) {
        return NextResponse.json(
          { ok: false, error: 'Verificação de WhatsApp inválida ou expirada. Tente novamente.' },
          { status: 400 },
        )
      }

      // Consume the token so it cannot be reused
      await supabaseAdmin
        .from('phone_verifications')
        .update({ verify_token: null })
        .eq('id', String(verif.id))

      phoneVerified = true
    }

    // ── Duplicate checks ──────────────────────────────────────────────────────

    const { data: existingRequest } = await supabaseAdmin
      .from('access_requests')
      .select('id, status')
      .eq('email', email)
      .maybeSingle()

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json({ ok: true, message: 'Solicitação já está pendente.', id: existingRequest.id })
      }
      if (existingRequest.status === 'approved' || existingRequest.status === 'accepted') {
        return NextResponse.json({ ok: true, message: 'Solicitação já foi aprovada. Faça login.', id: existingRequest.id })
      }
    }

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, is_approved')
      .ilike('email', email)
      .maybeSingle()

    if (existingProfile) {
      if (existingProfile.is_approved) {
        return NextResponse.json({ ok: false, error: 'Usuário já cadastrado e aprovado. Faça login.' }, { status: 400 })
      }
      return NextResponse.json({ ok: true, message: 'Cadastro já realizado. Aguarde a aprovação do administrador.' })
    }

    // ── Upsert access request ─────────────────────────────────────────────────

    if (existingRequest?.id && existingRequest.status === 'rejected') {
      const { error: updateError } = await supabaseAdmin
        .from('access_requests')
        .update({
          full_name,
          phone,
          birth_date: birth_date ?? null,
          role_requested: role_requested ?? 'student',
          cref: cref ?? null,
          phone_verified: phoneVerified,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRequest.id)

      if (updateError) {
        logError('access-request/create', 'Error updating request:', updateError)
        return NextResponse.json({ ok: false, error: 'Erro ao atualizar solicitação.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true, message: 'Solicitação enviada com sucesso!', id: existingRequest.id })
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('access_requests')
      .insert({
        email,
        phone,
        full_name,
        birth_date: birth_date ?? null,
        role_requested: role_requested ?? 'student',
        cref: cref ?? null,
        phone_verified: phoneVerified,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError) {
      logError('access-request/create', 'Error inserting request:', insertError)
      return NextResponse.json({ ok: false, error: 'Erro ao salvar solicitação.' }, { status: 500 })
    }

    // Notifica admins in-app (fire-and-forget — não bloqueia a resposta).
    notifyAdminNewSignup({
      name: full_name,
      email,
      role: role_requested === 'teacher' ? 'teacher' : 'student',
    }).catch(() => { })

    return NextResponse.json({ ok: true, message: 'Solicitação enviada com sucesso!', id: inserted?.id ?? null })

  } catch (error) {
    logError('access-request/create', error)
    return NextResponse.json({ ok: false, error: 'Erro interno do servidor.' }, { status: 500 })
  }
}

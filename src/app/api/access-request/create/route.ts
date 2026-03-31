import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/utils/supabase/admin'
import { parseJsonBody } from '@/utils/zod'
import { logError } from '@/lib/logger'
import { checkRateLimitAsync, getRequestIp } from '@/utils/rateLimit'

export const dynamic = 'force-dynamic'

const BodySchema = z
  .object({
    email: z.string().min(1),
    phone: z.string().optional().nullable(),
    full_name: z.string().min(1),
    birth_date: z.string().optional().nullable(),
    role_requested: z.string().optional().nullable(),
    cref: z.string().optional().nullable(),
  })
  .strip()

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req)
    const rl = await checkRateLimitAsync(`access_request:${ip}`, 10, 60_000)
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
    }

    const parsedBody = await parseJsonBody(req, BodySchema)
    if (parsedBody.response) return parsedBody.response
    const { email, phone, full_name, birth_date, role_requested, cref } = parsedBody.data!

    // 1. Validation
    if (!email || !full_name) {
      return NextResponse.json({ ok: false, error: 'Nome e e-mail são obrigatórios.' }, { status: 400 })
    }

    // Teacher specific validation
    if (role_requested === 'teacher' && !cref) {
      return NextResponse.json({ ok: false, error: 'CREF é obrigatório para cadastro de professor.' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ ok: false, error: 'E-mail inválido.' }, { status: 400 })
    }

    // 2. Check duplicate in access_requests
    const supabaseAdmin = createAdminClient()
    
    const { data: existingRequest } = await supabaseAdmin
      .from('access_requests')
      .select('id, status')
      .eq('email', email)
      .maybeSingle()

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return NextResponse.json({ ok: true, message: 'Solicitação já está pendente.', id: existingRequest.id })
      }
      // 'approved' is the canonical approved state (migration normalizes 'accepted' → 'approved')
      if (existingRequest.status === 'approved' || existingRequest.status === 'accepted') {
        return NextResponse.json({ ok: true, message: 'Solicitação já foi aprovada. Faça login.', id: existingRequest.id })
      }
      // If rejected (deleted), fall through to allow a fresh request
    }

    // 3. Check if profile already exists — user already completed signup
    const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, is_approved')
        .ilike('email', email)
        .maybeSingle()

    if (existingProfile) {
      if (existingProfile.is_approved) {
        return NextResponse.json({ ok: false, error: 'Usuário já cadastrado e aprovado. Faça login.' }, { status: 400 })
      }
      // Profile exists but not yet approved — treat as duplicate pending signup
      return NextResponse.json({ ok: true, message: 'Cadastro já realizado. Aguarde a aprovação do administrador.' })
    }

    // 4. Create / Reset Request
    if (existingRequest?.id && existingRequest.status === 'rejected') {
      const { error: updateError } = await supabaseAdmin
        .from('access_requests')
        .update({
          full_name,
          phone: phone ?? null,
          birth_date: birth_date ?? null,
          role_requested: role_requested || 'student',
          cref: cref || null,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingRequest.id)

      if (updateError) {
        logError('error', 'Error updating access request:', updateError)
        return NextResponse.json({ ok: false, error: 'Erro ao atualizar solicitação.' }, { status: 500 })
      }

      return NextResponse.json({ ok: true, message: 'Solicitação enviada com sucesso!', id: existingRequest.id })
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('access_requests')
      .insert({
        email,
        phone: phone ?? null,
        full_name,
        birth_date: birth_date ?? null,
        role_requested: role_requested || 'student',
        cref: cref || null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertError) {
      logError('error', 'Error inserting access request:', insertError)
      return NextResponse.json({ ok: false, error: 'Erro ao salvar solicitação.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Solicitação enviada com sucesso!', id: inserted?.id ?? null })

  } catch (error) {
    logError('error', 'Access Request Error:', error)
    return NextResponse.json({ ok: false, error: 'Erro interno do servidor.' }, { status: 500 })
  }
}
